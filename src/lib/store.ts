import { createHmac } from "node:crypto";
import { log } from "./log";
import { processWide } from "./process";

/**
 * Optional shared key-value store for state that must agree across serverless instances: rate-limit counters
 * and open circuit breakers. Speaks the Upstash Redis REST protocol, which Vercel KV also uses. Unset, or
 * unreachable, everything falls back to per-instance memory. It never holds channel data, tokens or raw IPs:
 * keys are HMAC-hashed and values are counters and flags.
 */
const url = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim().replace(/\/$/, "");
const token = () => (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

export const sharedStoreConfigured = () => Boolean(url() && token());

/** The store is on the hot path of every guarded request: give up quickly and fall back to memory. */
const TIMEOUT_MS = 800;
const DOWN_FOR_MS = 30_000;
const state = processWide("store", () => ({ downUntil: 0, lastWarn: 0 }));

/** Test hook. */
export const resetStore = () => { state.downUntil = 0; state.lastWarn = 0; };

function hashKey(kind: string, key: string): string {
  const salt = process.env.SESSION_SECRET || "hindsight";
  return `hs:${kind}:${createHmac("sha256", salt).update(key).digest("base64url").slice(0, 32)}`;
}

function markDown(reason: string) {
  state.downUntil = Date.now() + DOWN_FOR_MS;
  if (Date.now() - state.lastWarn > 60_000) {
    state.lastWarn = Date.now();
    log("warn", "shared store unavailable, using per-instance memory", { reason });
  }
}

/** Run Redis commands in one round trip. Null means "store unavailable"; callers then use local state. */
async function pipeline(cmds: (string | number)[][]): Promise<unknown[] | null> {
  const base = url(), auth = token();
  if (!base || !auth || Date.now() < state.downUntil) return null;
  try {
    const r = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) { markDown(`status ${r.status}`); return null; }
    const j = (await r.json()) as { result?: unknown; error?: unknown }[];
    if (!Array.isArray(j) || j.length !== cmds.length || j.some((x) => !x || typeof x !== "object" || "error" in x)) { markDown("malformed reply"); return null; }
    return j.map((x) => x.result);
  } catch (e) {
    markDown(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network");
    return null;
  }
}

/** Fixed-window counter. Returns the count after this hit and the window's remaining time, or null. */
export async function sharedHit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number } | null> {
  const k = hashKey("rl", key);
  const res = await pipeline([["INCR", k], ["PEXPIRE", k, Math.max(1, Math.round(windowMs)), "NX"], ["PTTL", k]]);
  if (!res) return null;
  const count = Number(res[0]);
  const ttl = Number(res[2]);
  if (!Number.isFinite(count) || count < 1) { markDown("bad counter"); return null; }
  return { count, ttlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs };
}

/** Set a flag that expires on its own (an open circuit). Best effort. */
export async function sharedFlag(name: string, ttlMs: number): Promise<void> {
  await pipeline([["SET", hashKey("flag", name), "1", "PX", Math.max(1, Math.round(ttlMs))]]);
}

/** Whether a flag is set. Null means "unknown" (store unset or down). */
export async function sharedFlagSet(name: string): Promise<boolean | null> {
  const res = await pipeline([["EXISTS", hashKey("flag", name)]]);
  return res ? Number(res[0]) === 1 : null;
}
