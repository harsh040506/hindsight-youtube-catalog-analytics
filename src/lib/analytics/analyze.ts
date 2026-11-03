import type { AnalysisOut, BucketOut, FeatureOut, FindingOut, MetricKey, ScoredVideo, Video, VideoRow } from "./types";
import { METRIC_LABELS } from "./types";
import { COHORT_HALF_WIDTH, MIN_AGE_DAYS, metricFns, scoreCatalog } from "./cohort";
import { buildFeatures, type Feature } from "./features";
import { ALPHA, benjaminiHochberg, compare, median } from "./stats";
import { isValidTimeZone } from "./time";

export const MIN_BUCKET_N = 20;
export const PERM_ITERS = 4000;
export const BOOT_ITERS = 1000;
export const SEED = 20260816;

export interface AnalysisBundle {
  out: AnalysisOut;
  scored: ScoredVideo[];
  eligible: ScoredVideo[];
  features: Feature[];
}

export interface AnalyzeOptions {
  tz: string;
  metric: MetricKey;
  now?: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function toRow(s: ScoredVideo): VideoRow {
  const v = s.video;
  return {
    id: v.id, title: v.title, publishedAt: v.publishedAt, durationS: v.durationS,
    views: v.views, likes: v.likes, comments: v.comments,
    pct: Math.round(s.percentile * 10) / 10, eligible: s.eligible, exclusion: s.exclusion,
  };
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Only well-formed public videos reach the statistics; one NaN would poison every mean and percentile. */
const usable = (v: Video) =>
  v && v.privacy === "public" && typeof v.id === "string" && finite(v.publishedAt) &&
  finite(v.views) && finite(v.likes) && finite(v.comments) && finite(v.durationS) && finite(v.descLen) && Array.isArray(v.tags);

export function analyze(allVideos: Video[], opts: AnalyzeOptions): AnalysisBundle {
  const now = finite(opts.now) ? opts.now! : Date.now();
  // Callers validate these, but the engine must never throw on a bad zone or metric (Intl throws RangeError).
  const tz = isValidTimeZone(opts.tz) ? opts.tz : "UTC";
  const metric: MetricKey = opts.metric in metricFns ? opts.metric : "views";
  opts = { ...opts, tz, metric };
  const videos = (Array.isArray(allVideos) ? allVideos : []).filter(usable).map((v) => (typeof v.title === "string" ? v : { ...v, title: "" }));
  const scored = scoreCatalog(videos, metricFns[opts.metric], now);
  const likeScored = scoreCatalog(videos, metricFns.likes, now);
  const likePct = new Map(likeScored.map((s) => [s.video.id, s.percentile]));
  const eligible = scored.filter((s) => s.eligible);

  const excluded: Record<string, number> = {};
  for (const s of scored) if (s.exclusion) excluded[s.exclusion] = (excluded[s.exclusion] ?? 0) + 1;
  const vals = eligible.map((s) => s.metric);

  const features = buildFeatures(eligible.map((s) => s.video), opts.tz);

  // 1. bucket every feature
  const grouped = new Map<string, Map<string, ScoredVideo[]>>();
  const pending: { fkey: string; bucket: string; res: ReturnType<typeof compare> }[] = [];
  const bucketsByFeature = new Map<string, BucketOut[]>();

  for (const f of features) {
    const groups = new Map<string, ScoredVideo[]>();
    for (const sv of eligible) {
      const b = f.extract(sv.video);
      if (b === null) continue;
      const arr = groups.get(b);
      if (arr) arr.push(sv);
      else groups.set(b, [sv]);
    }
    grouped.set(f.key, groups);
    const all = [...groups.values()].flat();
    const buckets: BucketOut[] = [];
    for (const [name, members] of groups) {
      const pcts = members.map((m) => m.percentile);
      buckets.push({
        bucket: name,
        n: members.length,
        meanPct: mean(pcts),
        medianMetric: median(members.map((m) => m.metric)),
        likePct: mean(members.map((m) => likePct.get(m.video.id) ?? 50)),
        test: null,
        examples: [...members].sort((a, b) => b.percentile - a.percentile).slice(0, 3)
          .map((m) => ({ id: m.video.id, title: m.video.title, metric: m.metric, pct: Math.round(m.percentile * 10) / 10 })),
      });
      const restN = all.length - members.length;
      if (members.length >= MIN_BUCKET_N && restN >= MIN_BUCKET_N) {
        const inSet = new Set(members);
        const rest = all.filter((m) => !inSet.has(m)).map((m) => m.percentile);
        pending.push({ fkey: f.key, bucket: name, res: compare(pcts, rest, PERM_ITERS, BOOT_ITERS, SEED) });
      }
    }
    buckets.sort((a, b) => b.meanPct - a.meanPct);
    bucketsByFeature.set(f.key, buckets);
  }

  // 2. one FDR correction across every test in the run
  const qs = benjaminiHochberg(pending.map((p) => p.res.p));
  pending.forEach((p, i) => {
    const b = bucketsByFeature.get(p.fkey)!.find((x) => x.bucket === p.bucket)!;
    b.test = { lift: p.res.lift, ciLow: p.res.ciLow, ciHigh: p.res.ciHigh, p: p.res.p, q: qs[i], significant: qs[i] <= ALPHA };
  });

  // 3. classify each lever and collect findings
  const featureOut: FeatureOut[] = [];
  const findings: FindingOut[] = [];
  for (const f of features) {
    const buckets = bucketsByFeature.get(f.key)!;
    const { status, note } = classify(buckets, eligible.length);
    const tested = buckets.filter((b) => b.test);
    const best = tested.length ? tested.reduce((a, b) => (b.meanPct > a.meanPct ? b : a)) : null;
    const worst = tested.length ? tested.reduce((a, b) => (b.meanPct < a.meanPct ? b : a)) : null;
    featureOut.push({
      key: f.key, label: f.label, lever: f.lever, group: f.group, description: f.description,
      status, note, buckets, spread: best && worst ? best.meanPct - worst.meanPct : 0,
    });
    if (status !== "tested") continue;
    for (const b of buckets) {
      if (!b.test?.significant) continue;
      const f2 = eraRobustness(f, b.bucket, b.test.lift, eligible);
      findings.push({
        featureKey: f.key, featureLabel: f.label, lever: f.lever, group: f.group,
        bucket: b.bucket, n: b.n, lift: b.test.lift, ciLow: b.test.ciLow, ciHigh: b.test.ciHigh,
        p: b.test.p, q: b.test.q, meanPct: b.meanPct, medianMetric: b.medianMetric, likePct: b.likePct,
        comparisonBucket: worst && worst !== b ? worst.bucket : null,
        comparisonPct: worst && worst !== b ? worst.meanPct : null,
        ...f2,
      });
    }
  }
  findings.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift) || a.q - b.q);

  // 4. timeline with a 15-video rolling mean
  const W = 15;
  const timeline = scored.map((s, i) => {
    const lo = Math.max(0, i - W + 1);
    const slice = scored.slice(lo, i + 1);
    return {
      t: s.video.publishedAt, pct: Math.round(s.percentile * 10) / 10,
      smooth: Math.round(mean(slice.map((x) => x.percentile)) * 10) / 10,
      views: s.video.views, title: s.video.title, id: s.video.id, eligible: s.eligible,
    };
  });

  const ranked = [...eligible].sort((a, b) => b.percentile - a.percentile);
  const out: AnalysisOut = {
    metric: opts.metric,
    metricLabel: METRIC_LABELS[opts.metric],
    tz: opts.tz,
    summary: {
      total: scored.length, eligible: eligible.length, excluded,
      median: median(vals), mean: mean(vals), max: vals.length ? Math.max(...vals) : 0,
      total_: vals.reduce((a, b) => a + b, 0),
    },
    features: featureOut,
    findings,
    untested: featureOut.filter((f) => f.status === "untested").map((f) => f.key),
    underpowered: featureOut.filter((f) => f.status === "underpowered").map((f) => f.key),
    timeline,
    top: ranked.slice(0, 6).map(toRow),
    bottom: ranked.slice(-6).reverse().map(toRow),
    params: { halfWidth: COHORT_HALF_WIDTH, minAgeDays: MIN_AGE_DAYS, minBucketN: MIN_BUCKET_N, alpha: ALPHA, iters: PERM_ITERS },
  };
  return { out, scored, eligible, features };
}

function classify(buckets: BucketOut[], total: number): { status: FeatureOut["status"]; note: string } {
  if (buckets.length <= 1) {
    return {
      status: "untested",
      note: `All ${total} analysed videos used the same value${buckets[0] ? ` (${buckets[0].bucket})` : ""}. This lever has never been varied on this channel.`,
    };
  }
  const testable = buckets.filter((b) => b.test);
  if (testable.length < 2) {
    const smallest = buckets.reduce((a, b) => (b.n < a.n ? b : a));
    const majority = buckets.reduce((a, b) => (b.n > a.n ? b : a));
    const share = total ? (majority.n / total) * 100 : 0;
    return {
      status: "underpowered",
      note: `${majority.n} of ${total} videos (${share.toFixed(0)}%) used “${majority.bucket}”, leaving only ${smallest.n} in the smallest alternative. A comparison needs at least ${MIN_BUCKET_N} videos on both sides, so this can’t be measured yet. That is not evidence it doesn’t matter.`,
    };
  }
  return { status: "tested", note: "" };
}

/** Re-test a finding on the older and newer halves of the catalog. */
function eraRobustness(f: Feature, bucket: string, lift: number, eligible: ScoredVideo[]) {
  const half = eligible.length >> 1;
  const floor = Math.max(8, MIN_BUCKET_N >> 1);
  const lifts: (number | null)[] = [];
  for (const subset of [eligible.slice(0, half), eligible.slice(half)]) {
    const g: number[] = [];
    const r: number[] = [];
    for (const sv of subset) {
      const b = f.extract(sv.video);
      if (b === null) continue;
      (b === bucket ? g : r).push(sv.percentile);
    }
    lifts.push(g.length >= floor && r.length >= floor ? mean(g) - mean(r) : null);
  }
  const [early, late] = lifts;
  let replicates = false;
  let eraNote: string;
  if (early === null || late === null) {
    eraNote = "Couldn’t be re-tested on both halves of the catalog — this choice wasn’t used often enough in one of the two periods.";
  } else if (early > 0 === late > 0 && late > 0 === lift > 0) {
    replicates = true;
    eraNote = `Replicates: the effect points the same way in both halves of the catalog (${signed(early)} early, ${signed(late)} late). That’s consistent with the choice causing the difference rather than a habit from one period.`;
  } else {
    eraNote = `Does not replicate: the effect is ${signed(early)} in the older half and ${signed(late)} in the newer half. It may reflect when this choice was being made rather than the choice itself. Treat it as a hypothesis, not a conclusion.`;
  }
  return { earlyLift: early, lateLift: late, replicates, eraNote };
}

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
