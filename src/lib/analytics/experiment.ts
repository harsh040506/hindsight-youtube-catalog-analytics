import type { AnalysisBundle } from "./analyze";
import { MIN_BUCKET_N } from "./analyze";
import { contentWords } from "./features";
import { hashString, mulberry32 } from "./rng";
import { compare, requiredSampleSize, stdDev } from "./stats";
import { MIN_AGE_DAYS } from "./cohort";

export const BUDGET_DAYS = 90;
const MDES = [5, 7.5, 10, 15, 20];

export interface Arm { id: "A" | "B"; name: string; bucket: string | null; detail: string }

export interface Plan {
  featureKey: string;
  label: string;
  lever: string;
  kind: "explore" | "confirm";
  origin: "untested" | "underpowered" | "tested";
  rationale: string;
  control: Arm;
  challenger: Arm;
  sd: number;
  perArm: number;
  mde: number;
  weeks: number;
  uploadsPerWeek: number;
  feasible: boolean;
  sizing: { mde: number; perArm: number; weeks: number }[];
  frozen: { label: string; value: string }[];
  schedule: ("A" | "B")[];
}

/** Uploads per week over the trailing 90 days (falls back to the whole catalog's pace). */
export function uploadsPerWeek(bundle: AnalysisBundle, now: number): number {
  const vids = bundle.scored.map((s) => s.video);
  if (!vids.length) return 0;
  const recent = vids.filter((v) => v.publishedAt >= now - 90 * 86400000).length;
  if (recent >= 6) return (recent / 90) * 7;
  const span = Math.max(30, (now - Math.min(...vids.map((v) => v.publishedAt))) / 86400000);
  return (vids.length / span) * 7;
}

function minedTags(bundle: AnalysisBundle, existing: Set<string>): string[] {
  const ranked = [...bundle.eligible].sort((a, b) => b.percentile - a.percentile);
  const top = ranked.slice(0, Math.max(10, Math.floor(ranked.length / 4)));
  const counts = new Map<string, number>();
  for (const s of top) for (const w of new Set(contentWords(s.video.title))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].filter(([w]) => !existing.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
}

function schedule(seed: string, n = 12): ("A" | "B")[] {
  const rand = mulberry32(hashString(seed));
  const out: ("A" | "B")[] = [];
  while (out.length < n) {
    const block: ("A" | "B")[] = ["A", "A", "B", "B"];
    for (let i = block.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [block[i], block[j]] = [block[j], block[i]];
    }
    out.push(...block);
  }
  return out.slice(0, n);
}

export function designPlans(bundle: AnalysisBundle, channelId: string, now: number, limit = 4): Plan[] {
  const { out, eligible } = bundle;
  if (eligible.length < 60) return [];
  const sd = stdDev(eligible.map((s) => s.percentile)) || 28.9;
  const upw = uploadsPerWeek(bundle, now);
  const superseded = new Set(out.features.flatMap((f) => bundle.features.find((x) => x.key === f.key)?.supersedes ?? []));

  const strongest = out.findings.filter((f) => f.replicates && f.lift > 0);
  const candidates: { score: number; plan: Omit<Plan, "sd" | "perArm" | "mde" | "weeks" | "uploadsPerWeek" | "feasible" | "sizing" | "frozen" | "schedule"> }[] = [];

  for (const f of out.features) {
    if (superseded.has(f.key)) continue;
    if (f.status === "untested") {
      const only = f.buckets[0]?.bucket ?? "the current value";
      let challenger: Arm = { id: "B", name: "Change it", bucket: null, detail: f.lever };
      if (f.key === "tag_set") {
        const existing = new Set(eligible.flatMap((s) => s.video.tags.map((t) => t.toLowerCase())));
        const mined = minedTags(bundle, existing);
        if (mined.length) challenger = { id: "B", name: "Expanded tags", bucket: null, detail: `Use: ${mined.join(", ")}` };
      }
      candidates.push({
        score: 100 + (f.group === "timing" ? 5 : 0),
        plan: {
          featureKey: f.key, label: f.label, lever: f.lever, kind: "explore", origin: "untested",
          rationale: `Every one of your ${eligible.length} analysed videos used the same value, so this lever has never been tested. It is the only kind of lever guaranteed to still have headroom.`,
          control: { id: "A", name: "Keep as is", bucket: only, detail: only },
          challenger,
        },
      });
    } else if (f.status === "underpowered") {
      const majority = f.buckets.reduce((a, b) => (b.n > a.n ? b : a));
      const other = f.buckets.filter((b) => b !== majority).reduce((a, b) => (b.n > a.n ? b : a), f.buckets.find((b) => b !== majority)!);
      if (!other) continue;
      candidates.push({
        score: 60,
        plan: {
          featureKey: f.key, label: f.label, lever: f.lever, kind: "explore", origin: "underpowered",
          rationale: f.note,
          control: { id: "A", name: majority.bucket, bucket: majority.bucket, detail: `${majority.n} past videos` },
          challenger: { id: "B", name: other.bucket, bucket: other.bucket, detail: `only ${other.n} past ${other.n === 1 ? "video" : "videos"}` },
        },
      });
    } else {
      const sig = out.findings.filter((x) => x.featureKey === f.key && x.lift > 0).sort((a, b) => b.lift - a.lift)[0];
      if (!sig) continue;
      const base = sig.comparisonBucket ?? f.buckets[f.buckets.length - 1].bucket;
      candidates.push({
        score: Math.min(55, Math.abs(sig.lift)) * (sig.replicates ? 1 : 0.7),
        plan: {
          featureKey: f.key, label: f.label, lever: f.lever, kind: "confirm", origin: "tested",
          rationale: `Observed: “${sig.bucket}” beat the rest by ${sig.lift.toFixed(1)} percentile points (q=${sig.q.toFixed(3)}). Observation isn’t causation — a randomised test settles it.`,
          control: { id: "A", name: base, bucket: base, detail: "your weaker option" },
          challenger: { id: "B", name: sig.bucket, bucket: sig.bucket, detail: "your stronger option" },
        },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map(({ plan }) => {
    const sizing = MDES.map((mde) => {
      const n = requiredSampleSize(sd, mde);
      return { mde, perArm: n, weeks: upw > 0 ? (2 * n) / upw : Infinity };
    });
    const within = sizing.find((s) => s.weeks * 7 <= BUDGET_DAYS);
    const pick = within ?? sizing[sizing.length - 1];
    const frozen = strongest
      .filter((s) => s.featureKey !== plan.featureKey && !superseded.has(s.featureKey))
      .slice(0, 3)
      .map((s) => ({ label: s.featureLabel, value: s.bucket }));
    return {
      ...plan, sd, perArm: pick.perArm, mde: pick.mde, weeks: pick.weeks, uploadsPerWeek: upw,
      feasible: Boolean(within), sizing: sizing.map((s) => ({ ...s, weeks: Number.isFinite(s.weeks) ? s.weeks : 0 })),
      frozen, schedule: schedule(`${channelId}:${plan.featureKey}`),
    };
  });
}

export interface TrackedExperiment {
  featureKey: string;
  control: { name: string; bucket: string | null };
  challenger: { name: string; bucket: string | null };
  startedAt: number;
  perArm: number;
}

export interface Readout {
  state: "no-data" | "collecting" | "ready";
  nA: number;
  nB: number;
  pending: number;
  perArm: number;
  meanA: number;
  meanB: number;
  lift: number;
  ciLow: number;
  ciHigh: number;
  p: number;
  verdict: string;
  warning: string | null;
}

export function readExperiment(bundle: AnalysisBundle, exp: TrackedExperiment, now: number): Readout {
  const feature = bundle.features.find((f) => f.key === exp.featureKey);
  // Deliberately reads `scored`, not `eligible`: the newest uploads are always at the catalog's edge, and
  // waiting for 25 later videos would delay any readout by months. Their one-sided cohort is shared by both
  // arms because the schedule interleaves A and B, so the comparison stays fair. Zero-duration items
  // (livestreams, still processing) aren't comparable uploads and are skipped.
  const since = bundle.scored.filter((s) => s.video.publishedAt >= exp.startedAt && s.video.durationS > 0);
  const matured = since.filter((s) => s.video.publishedAt <= now - MIN_AGE_DAYS * 86400000);
  const pending = since.length - matured.length;
  const a: number[] = [];
  const b: number[] = [];
  if (feature) {
    for (const s of matured) {
      const bucket = feature.extract(s.video);
      if (bucket === null) continue;
      if (bucket === exp.control.bucket) a.push(s.percentile);
      else if (exp.challenger.bucket === null || bucket === exp.challenger.bucket) b.push(s.percentile);
    }
  }
  const base = { nA: a.length, nB: b.length, pending, perArm: exp.perArm, meanA: 0, meanB: 0, lift: 0, ciLow: 0, ciHigh: 0, p: 1 };
  if (a.length + b.length === 0) {
    return { ...base, state: "no-data", verdict: pending ? `${pending} upload${pending === 1 ? " is" : "s are"} still younger than ${MIN_AGE_DAYS} days and can’t be scored yet.` : "No uploads since you started. Publish using the schedule and check back.", warning: null };
  }
  const have = Math.min(a.length, b.length);
  if (have < 5) {
    return { ...base, state: "collecting", meanA: avg(a), meanB: avg(b), verdict: "Too few scored uploads in one arm to read anything yet.", warning: null };
  }
  const t = compare(b, a, 5000, 1000, 7);
  const ready = have >= exp.perArm;
  const sig = t.p < 0.05;
  const verdict = !ready
    ? `Not enough yet: ${have} of ${exp.perArm} uploads per arm. Reading out early and stopping when it looks significant is how a test that was never real produces a finding.`
    : sig
      ? `${exp.challenger.name} ${t.lift >= 0 ? "beat" : "lost to"} ${exp.control.name} by ${Math.abs(t.lift).toFixed(1)} percentile points (95% CI ${t.ciLow.toFixed(1)} to ${t.ciHigh.toFixed(1)}, p=${t.p.toFixed(3)}).`
      : `No detectable difference at this sample size (${t.lift >= 0 ? "+" : "−"}${Math.abs(t.lift).toFixed(1)} points, 95% CI ${t.ciLow.toFixed(1)} to ${t.ciHigh.toFixed(1)}, p=${t.p.toFixed(2)}). That is a result: any effect is smaller than the test was sized to see.`;
  return {
    ...base, state: ready ? "ready" : "collecting", meanA: t.meanRest, meanB: t.meanGroup,
    lift: t.lift, ciLow: t.ciLow, ciHigh: t.ciHigh, p: t.p, verdict,
    warning: !ready && sig ? "This looks significant already — don’t stop early. Peeking inflates false positives." : null,
  };
}

const avg = (x: number[]) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0);
export { MIN_BUCKET_N };
