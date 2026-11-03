import type { MetricKey, ScoredVideo, Video } from "./types";
import { median } from "./stats";

export const COHORT_HALF_WIDTH = 25;
export const MIN_AGE_DAYS = 14;

export const metricFns: Record<MetricKey, (v: Video) => number> = {
  views: (v) => v.views,
  likes: (v) => (v.views > 0 ? (v.likes / v.views) * 1000 : 0),
  comments: (v) => (v.views > 0 ? (v.comments / v.views) * 1000 : 0),
  engagement: (v) => (v.views > 0 ? ((v.likes + v.comments) / v.views) * 1000 : 0),
};

/** Percentile rank of value among others, ties at half weight (so identical cohorts land at 50). */
function percentileWithin(value: number, others: number[]): number {
  if (!others.length) return 50;
  let below = 0;
  let tied = 0;
  for (const o of others) {
    if (o < value) below++;
    else if (o === value) tied++;
  }
  return ((below + 0.5 * tied) / others.length) * 100;
}

/**
 * Score each video against the HALF_WIDTH videos published before and after it.
 * Slow-moving effects (channel size, season, age) are shared by the cohort and cancel out.
 */
export function scoreCatalog(
  videos: Video[],
  metric: (v: Video) => number,
  now: number,
  halfWidth = COHORT_HALF_WIDTH,
  minAgeDays = MIN_AGE_DAYS,
): ScoredVideo[] {
  const ordered = [...videos].sort((a, b) => a.publishedAt - b.publishedAt);
  const values = ordered.map(metric);
  const n = ordered.length;
  const cutoff = now - minAgeDays * 86400000;
  return ordered.map((video, i) => {
    const lo = Math.max(0, i - halfWidth);
    const hi = Math.min(n, i + halfWidth + 1);
    const neighbours = [...values.slice(lo, i), ...values.slice(i + 1, hi)];
    const full = i - halfWidth >= 0 && i + halfWidth < n;
    let exclusion: string | null = null;
    if (!full) exclusion = "edge of catalog (no symmetric cohort)";
    else if (video.publishedAt > cutoff) exclusion = `younger than ${minAgeDays} days (still accumulating views)`;
    else if (!video.durationS) exclusion = "zero duration (live broadcast or still processing)";
    return {
      video,
      metric: values[i],
      percentile: percentileWithin(values[i], neighbours),
      cohortSize: neighbours.length,
      cohortMedian: median(neighbours),
      cohortFull: full,
      eligible: exclusion === null,
      exclusion,
    };
  });
}
