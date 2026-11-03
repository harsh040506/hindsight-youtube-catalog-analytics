"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { isValidTimeZone } from "./analytics/time";
import type { TrackedExperiment } from "./analytics/experiment";
import { dropCache } from "./data";
import { clientIp, isChannelId, rateLimit } from "./guard";
import { errMsg, log } from "./log";
import { getExperiments, PREFS_COOKIE, EXP_COOKIE, getPrefs, isMetric, sanitizeExperiment, type ExpMap } from "./prefs";
import { getSession } from "./session";

type Result = { ok: boolean; error?: string };

const opts = { httpOnly: false, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
/** Leave headroom under the ~4 KB per-cookie browser limit, past which the cookie is silently dropped. */
const COOKIE_BUDGET = 3800;

/** Every action reports failure as a value with a friendly message; nothing escapes as an unhandled exception. */
async function safely(name: string, fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // Next.js signals redirect/notFound by throwing; those must propagate.
    log("error", "server action failed", { action: name, error: errMsg(e) });
    return { ok: false, error: "That didn’t work. Please try again in a moment." };
  }
}

const field = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" ? v.slice(0, 100) : null;
};

export async function savePrefs(form: FormData): Promise<Result> {
  return safely("savePrefs", async () => {
    if (!(form instanceof FormData)) return { ok: false, error: "That form couldn’t be read. Please reload the page." };
    const cur = await getPrefs();
    const tz = field(form, "tz");
    const metric = field(form, "metric");
    if (tz !== null && !isValidTimeZone(tz)) return { ok: false, error: "That time zone isn’t recognised. Pick one from the list." };
    if (metric !== null && !isMetric(metric)) return { ok: false, error: "That metric isn’t available. Pick one of the options." };
    (await cookies()).set(PREFS_COOKIE, JSON.stringify({ tz: tz ?? cur.tz, metric: metric ?? cur.metric }), opts);
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

export async function refreshChannel(channelId: string): Promise<Result> {
  return safely("refreshChannel", async () => {
    if (!(await authorised(channelId))) return { ok: false, error: "Unknown channel." };
    // Each refresh is a full catalog scan against a shared daily API quota.
    const ip = clientIp(await headers());
    const rl = await rateLimit(`refresh:${channelId}:${ip}`, 3, 5 * 60_000);
    if (!rl.ok) return { ok: false, error: `This channel was refreshed moments ago. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` };
    dropCache(channelId);
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

export async function syncTimeZone(tz: string): Promise<void> {
  try {
    if (typeof tz !== "string" || tz.length > 64) return;
    const cur = (await cookies()).get(PREFS_COOKIE)?.value;
    if (cur || !isValidTimeZone(tz)) return;
    const p = await getPrefs();
    (await cookies()).set(PREFS_COOKIE, JSON.stringify({ tz, metric: p.metric }), opts);
    revalidatePath("/dashboard", "layout");
  } catch (e) {
    // Purely a convenience: the dashboard already works in the server's best-guess zone.
    log("warn", "time zone sync failed", { error: errMsg(e) });
  }
}

async function authorised(channelId: unknown): Promise<boolean> {
  if (!isChannelId(channelId)) return false;
  return channelId === "demo" || (await getSession()).channels.some((c) => c.id === channelId);
}

/** Drop other channels' experiments (the ones not connected any more first) until the cookie fits. */
function fitExperiments(all: ExpMap, keep: string, connected: Set<string>): ExpMap {
  const out = { ...all };
  const order = Object.keys(out).filter((k) => k !== keep).sort((a, b) => Number(connected.has(a)) - Number(connected.has(b)) || out[a].startedAt - out[b].startedAt);
  while (JSON.stringify(out).length > COOKIE_BUDGET && order.length) delete out[order.shift()!];
  return out;
}

export async function startExperiment(channelId: string, exp: TrackedExperiment): Promise<Result> {
  return safely("startExperiment", async () => {
    const clean = sanitizeExperiment(exp);
    if (!clean || !(await authorised(channelId)) || channelId === "demo") return { ok: false, error: "That experiment couldn’t be saved." };
    const all = await getExperiments();
    // Idempotent: a double-click or a retried request must not restart the clock on a running experiment.
    const running = all[channelId];
    if (running && running.featureKey === clean.featureKey && running.challenger.bucket === clean.challenger.bucket && running.control.bucket === clean.control.bucket) return { ok: true };
    if (running) return { ok: false, error: "Another experiment is already running on this channel. Stop it first." };
    all[channelId] = { ...clean, startedAt: Date.now() }; // the moment you press the button, not when the page rendered
    const connected = new Set((await getSession()).channels.map((c) => c.id));
    const fitted = fitExperiments(all, channelId, connected);
    const value = JSON.stringify(fitted);
    if (value.length > COOKIE_BUDGET) return { ok: false, error: "That experiment is too large to save in this browser." };
    (await cookies()).set(EXP_COOKIE, value, opts);
    revalidatePath(`/dashboard/${channelId}/experiments`);
    return { ok: true };
  });
}

export async function stopExperiment(channelId: string): Promise<Result> {
  return safely("stopExperiment", async () => {
    if (!isChannelId(channelId)) return { ok: false, error: "Unknown channel." };
    const all = await getExperiments();
    if (!all[channelId]) return { ok: true }; // already stopped: idempotent
    delete all[channelId];
    (await cookies()).set(EXP_COOKIE, JSON.stringify(all), opts);
    revalidatePath(`/dashboard/${channelId}/experiments`);
    return { ok: true };
  });
}
