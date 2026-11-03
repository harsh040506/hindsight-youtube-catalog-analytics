import { mulberry32 } from "./rng";

export const ALPHA = 0.05;
export const TARGET_POWER = 0.8;

export interface TestResult {
  nGroup: number;
  nRest: number;
  meanGroup: number;
  meanRest: number;
  lift: number;
  ciLow: number;
  ciHigh: number;
  p: number;
}

const mean = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
};

/** Two-sided permutation test on the difference of means. */
export function permutationTest(group: number[], rest: number[], iters: number, seed: number): number {
  // The statistic is symmetric, so shuffle only the smaller side: a "no emoji" bucket of 4,900 against
  // 100 costs 100 draws per iteration instead of 4,900, which keeps big catalogs inside the time limit.
  if (group.length > rest.length) [group, rest] = [rest, group];
  const nA = group.length;
  const nB = rest.length;
  if (!nA || !nB) return 1;
  const N = nA + nB;
  const pool = new Float64Array(N);
  let total = 0;
  for (let i = 0; i < nA; i++) pool[i] = group[i];
  for (let i = 0; i < nB; i++) pool[nA + i] = rest[i];
  for (let i = 0; i < N; i++) total += pool[i];
  const observed = Math.abs(mean(group) - mean(rest));
  const rand = mulberry32(seed);
  const idx = new Uint32Array(N);
  for (let i = 0; i < N; i++) idx[i] = i;
  let hits = 0;
  for (let it = 0; it < iters; it++) {
    let sumA = 0;
    for (let k = 0; k < nA; k++) {
      const j = k + Math.floor(rand() * (N - k));
      const t = idx[k];
      idx[k] = idx[j];
      idx[j] = t;
      sumA += pool[idx[k]];
    }
    const diff = Math.abs(sumA / nA - (total - sumA) / nB);
    if (diff >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (iters + 1);
}

/** Percentile bootstrap CI for (mean(group) - mean(rest)). */
export function bootstrapCI(group: number[], rest: number[], iters: number, seed: number, confidence = 0.95): [number, number] {
  if (!group.length || !rest.length) return [0, 0];
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const diffs = new Float64Array(iters);
  for (let it = 0; it < iters; it++) {
    let sa = 0;
    for (let i = 0; i < group.length; i++) sa += group[Math.floor(rand() * group.length)];
    let sb = 0;
    for (let i = 0; i < rest.length; i++) sb += rest[Math.floor(rand() * rest.length)];
    diffs[it] = sa / group.length - sb / rest.length;
  }
  diffs.sort();
  const tail = (1 - confidence) / 2;
  const at = (f: number) => diffs[Math.min(iters - 1, Math.max(0, Math.round(f * (iters - 1))))];
  return [at(tail), at(1 - tail)];
}

export function compare(group: number[], rest: number[], permIters: number, bootIters: number, seed: number): TestResult {
  const [ciLow, ciHigh] = bootstrapCI(group, rest, bootIters, seed);
  const mg = mean(group);
  const mr = mean(rest);
  return {
    nGroup: group.length,
    nRest: rest.length,
    meanGroup: mg,
    meanRest: mr,
    lift: mg - mr,
    ciLow,
    ciHigh,
    p: permutationTest(group, rest, permIters, seed),
  };
}

/** Benjamini-Hochberg step-up FDR correction. Returns q-values in input order. */
export function benjaminiHochberg(p: number[]): number[] {
  const n = p.length;
  if (!n) return [];
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(n);
  let running = 1;
  for (let r = n - 1; r >= 0; r--) {
    const scaled = (order[r][0] * n) / (r + 1);
    running = Math.min(running, scaled);
    q[order[r][1]] = Math.min(1, Math.max(0, running));
  }
  return q;
}

/** Acklam's inverse normal CDF approximation. */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0,1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Per-arm sample size to detect `minEffect` percentile points (two-sided, equal arms). */
export function requiredSampleSize(stdDev: number, minEffect: number, power = TARGET_POWER, alpha = ALPHA): number {
  if (minEffect <= 0) throw new RangeError("minEffect must be positive");
  if (stdDev <= 0) return 2;
  const za = inverseNormalCdf(1 - alpha / 2);
  const zb = inverseNormalCdf(power);
  return Math.max(2, Math.ceil((2 * (za + zb) ** 2 * stdDev ** 2) / minEffect ** 2));
}

export function stdDev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / (a.length - 1));
}

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
