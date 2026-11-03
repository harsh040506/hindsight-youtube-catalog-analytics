import { log } from "./log";
import { processWide } from "./process";
import { sharedFlag, sharedFlagSet, sharedStoreConfigured } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** A dependency failed after every retry, timed out, or is short-circuited. Message is safe to show. */
export class UpstreamError extends Error {
  constructor(readonly kind: "timeout" | "network" | "circuit", readonly label: string) {
    super(kind === "circuit" ? "A service we depend on is having trouble. Please try again in a minute." : kind === "timeout" ? "The request took too long. Please try again." : "We couldn’t reach a service we depend on. Please try again.");
    this.name = "UpstreamError";
  }
}

/* ---------- circuit breaker ---------- */
// After THRESHOLD consecutive hard failures a dependency is skipped for COOLDOWN_MS, so a Google outage
// fails fast (and serves cached data) instead of tying up every request for the full retry budget.
const THRESHOLD = 5;
const COOLDOWN_MS = 30_000;
// With a shared store an open circuit is announced to every instance; each instance re-checks at most every
// REMOTE_CHECK_MS so the store isn't hit on every upstream call.
const breakers = processWide("breakers", () => new Map<string, { fails: number; openUntil: number }>());
const REMOTE_CHECK_MS = 5000;
const remote = processWide("breakers.remote", () => new Map<string, { at: number; open: boolean }>());

async function breakerOpen(name: string): Promise<boolean> {
  const b = breakers.get(name);
  if (b && b.openUntil > Date.now()) return true;
  if (!sharedStoreConfigured()) return false;
  const seen = remote.get(name);
  if (seen && Date.now() - seen.at < REMOTE_CHECK_MS) return seen.open;
  const open = (await sharedFlagSet(`breaker:${name}`)) === true; // unknown (store down) counts as closed
  remote.set(name, { at: Date.now(), open });
  return open;
}

function breakerResult(name: string, ok: boolean) {
  if (ok) { breakers.delete(name); return; }
  const b = breakers.get(name) ?? { fails: 0, openUntil: 0 };
  b.fails++;
  if (b.fails >= THRESHOLD) {
    b.openUntil = Date.now() + COOLDOWN_MS;
    b.fails = 0;
    log("error", "circuit opened", { breaker: name, cooldownMs: COOLDOWN_MS });
    void sharedFlag(`breaker:${name}`, COOLDOWN_MS);
  }
  breakers.set(name, b);
}

/** Test hook. */
export const resetBreakers = () => { breakers.clear(); remote.clear(); };

/**
 * fetch with a hard timeout and jittered exponential backoff on network errors, 429 and 5xx.
 * With `breaker`, repeated failures open a circuit that short-circuits further calls for a while.
 */
export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number; label?: string; breaker?: string } = {},
): Promise<Response> {
  const { retries = 3, timeoutMs = 15_000, label = "fetch", breaker } = opts;
  if (breaker && (await breakerOpen(breaker))) throw new UpstreamError("circuit", label);
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (!RETRYABLE.has(res.status) || attempt === retries) {
        if (breaker) breakerResult(breaker, res.status < 500);
        return res;
      }
      // Retry-After is seconds or an HTTP date; anything else falls back to backoff.
      const raw = res.headers.get("retry-after");
      const secs = raw === null ? NaN : Number(raw);
      const dateWait = raw && Number.isNaN(secs) ? Date.parse(raw) - Date.now() : NaN;
      const hinted = Number.isFinite(secs) && secs > 0 ? secs * 1000 : Number.isFinite(dateWait) && dateWait > 0 ? dateWait : NaN;
      const wait = Number.isFinite(hinted) ? Math.min(hinted, 5000) : 300 * 2 ** attempt + Math.random() * 200;
      log("warn", `${label} retrying`, { status: res.status, attempt: attempt + 1 });
      await res.body?.cancel().catch(() => {});
      await sleep(wait);
    } catch (e) {
      last = e;
      if (attempt === retries) break;
      log("warn", `${label} network error, retrying`, { attempt: attempt + 1, timeout: e instanceof Error && e.name === "AbortError" });
      await sleep(300 * 2 ** attempt + Math.random() * 200);
    } finally {
      clearTimeout(timer);
    }
  }
  if (breaker) breakerResult(breaker, false);
  const kind = last instanceof Error && last.name === "AbortError" ? "timeout" : "network";
  log("error", `${label} failed`, { kind, retries });
  throw new UpstreamError(kind, label);
}

/** Parse a JSON body without letting a malformed or truncated response throw a raw SyntaxError. */
export async function readJson<T>(res: Response, label: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    log("error", `${label} returned malformed JSON`, { status: res.status });
    throw new UpstreamError("network", label);
  }
}

const inflight = processWide("inflight", () => new Map<string, Promise<unknown>>());

/** Coalesce concurrent calls with the same key into one execution (layout + page + prefetches). */
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  let p: Promise<T>;
  try {
    p = fn();
  } catch (e) {
    return Promise.reject(e); // a synchronous throw must not escape as an exception from `once` itself
  }
  p = p.finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
