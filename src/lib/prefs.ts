import { cookies, headers } from "next/headers";
import type { MetricKey } from "./analytics/types";
import { isValidTimeZone } from "./analytics/time";
import type { TrackedExperiment } from "./analytics/experiment";
import { isChannelId } from "./guard";

export interface Prefs { tz: string; metric: MetricKey }
export const PREFS_COOKIE = "hs_prefs";
export const EXP_COOKIE = "hs_exp";
export const METRICS: readonly MetricKey[] = ["views", "engagement", "likes", "comments"];
export const isMetric = (x: unknown): x is MetricKey => typeof x === "string" && (METRICS as readonly string[]).includes(x);
/** One active experiment per channel; more entries than this can only come from a tampered cookie. */
export const MAX_EXPERIMENTS = 10;

/** Cookies are user-controlled: parse to a plain object or nothing, never throw. */
function parseObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function getPrefs(): Promise<Prefs> {
  const jar = await cookies();
  const p = parseObject(jar.get(PREFS_COOKIE)?.value) ?? {};
  let tz = typeof p.tz === "string" && p.tz.length <= 64 && isValidTimeZone(p.tz) ? p.tz : undefined;
  const metric: MetricKey = isMetric(p.metric) ? p.metric : "views";
  if (!tz) {
    const guess = (await headers()).get("x-vercel-ip-timezone");
    tz = guess && guess.length <= 64 && isValidTimeZone(guess) ? guess : "UTC";
  }
  return { tz, metric };
}

export type ExpMap = Record<string, TrackedExperiment>;

const KEY = /^[a-z0-9_]{1,40}$/;
/** Arm names and buckets can be a whole tag set (five tags of up to 100 characters each). */
const LABEL_MAX = 600;
const str = (x: unknown, max = LABEL_MAX) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : null);

/** Cookies are user-controlled input: accept only well-formed experiment records. */
export function sanitizeExperiment(x: unknown): TrackedExperiment | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, any>;
  const featureKey = str(o.featureKey, 40);
  const cName = str(o.control?.name), aName = str(o.challenger?.name);
  const startedAt = Number(o.startedAt), perArm = Number(o.perArm);
  if (!featureKey || !KEY.test(featureKey) || !cName || !aName) return null;
  if (!Number.isFinite(startedAt) || startedAt < 1.5e12 || startedAt > Date.now() + 864e5) return null;
  if (!Number.isFinite(perArm) || perArm < 2 || perArm > 5000) return null;
  const bucket = (b: unknown) => (b === null ? null : str(b));
  const cBucket = bucket(o.control?.bucket), aBucket = bucket(o.challenger?.bucket);
  // A missing or malformed control bucket would silently match nothing; only the challenger may be "anything else".
  if (cBucket === null) return null;
  return {
    featureKey, startedAt, perArm: Math.round(perArm),
    control: { name: cName, bucket: cBucket },
    challenger: { name: aName, bucket: aBucket },
  };
}

export async function getExperiments(): Promise<ExpMap> {
  const jar = await cookies();
  const out: ExpMap = {};
  const v = parseObject(jar.get(EXP_COOKIE)?.value);
  if (!v) return out;
  for (const [k, e] of Object.entries(v)) {
    if (Object.keys(out).length >= MAX_EXPERIMENTS) break;
    const s = sanitizeExperiment(e);
    if (s && isChannelId(k)) out[k] = s;
  }
  return out;
}
