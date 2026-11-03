import { processWide } from "./process";
import { sharedHit } from "./store";

/**
 * Fixed-window rate limiter. With a shared store configured (see store.ts) the limit holds across every
 * serverless instance; otherwise, or while the store is unreachable, each instance counts on its own.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }> {
  const shared = await sharedHit(key, windowMs);
  if (shared) return { ok: shared.count <= max, retryAfter: shared.count <= max ? 0 : Math.ceil(shared.ttlMs / 1000) };
  return localRateLimit(key, max, windowMs);
}

const buckets = processWide("buckets", () => new Map<string, { n: number; reset: number }>());
const MAX_KEYS = 5000;

/** Per-instance fallback, bounded in memory. */
export function localRateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    // Still full of live windows (a flood of distinct keys): drop the oldest half rather than grow without bound.
    if (buckets.size > MAX_KEYS) for (const k of [...buckets.keys()].slice(0, MAX_KEYS >> 1)) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.n++;
  return { ok: b.n <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

const IP = /^[0-9a-fA-F:.]{2,45}$/;

export function clientIp(h: Headers): string {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return IP.test(ip) ? ip : "unknown";
}

/** host[:port] with conservative characters only; anything else in a Host header is treated as absent. */
const HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/i;
export const isHost = (s: string | null | undefined): s is string => typeof s === "string" && s.length <= 255 && HOST.test(s);

export function requestHost(h: Headers): string | null {
  const fwd = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (isHost(fwd)) return fwd;
  const host = h.get("host")?.trim();
  return isHost(host) ? host : null;
}

/**
 * Reject cross-site state-changing requests. Uses Fetch Metadata when present (all current browsers),
 * then falls back to comparing Origin with the Host. A request with neither is a non-browser client.
 */
export function sameOrigin(h: Headers): boolean {
  const site = h.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = h.get("origin");
  if (!origin) return true;
  const host = requestHost(h);
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const CHANNEL_ID = /^(demo|UC[\w-]{22})$/;
export const isChannelId = (s: unknown): s is string => typeof s === "string" && CHANNEL_ID.test(s);
