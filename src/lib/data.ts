import { analyze, type AnalysisBundle } from "./analytics/analyze";
import { DEMO_ID, DEMO_TZ, demoChannel, demoVideos } from "./analytics/demo";
import type { ChannelInfo, MetricKey, Video } from "./analytics/types";
import { accessTokenFor, ConfigError, forgetToken, ReauthError } from "./google";
import { log, errMsg } from "./log";
import { once, UpstreamError } from "./net";
import type { Prefs } from "./prefs";
import { processWide } from "./process";
import { getSession } from "./session";
import { fetchCatalog, fetchOwnChannel, YouTubeError } from "./youtube";

const TTL = 20 * 60 * 1000;
/** A partial read (time budget hit) is retried sooner than a complete one. */
const PARTIAL_TTL = 3 * 60 * 1000;
const DEMO_NOW = Date.parse("2026-08-16T00:00:00Z");
interface Entry { at: number; channel: ChannelInfo; videos: Video[]; partial: boolean }
const catalogCache = processWide("catalog", () => new Map<string, Entry>());
const analysisCache = processWide("analysis", () => new Map<string, { at: number; bundle: AnalysisBundle }>());

function prune<T extends { at: number }>(m: Map<string, T>, max: number) {
  while (m.size > max) {
    const oldest = [...m.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!oldest) return;
    m.delete(oldest[0]);
  }
}

export type LoadResult =
  | { ok: true; channel: ChannelInfo; videos: Video[]; bundle: AnalysisBundle; demo: boolean; fetchedAt: number; tz: string; now: number; stale: string | null; partial: boolean }
  | { ok: false; kind: "not-found" | "reauth" | "error"; message: string };

export function dropCache(channelId: string) {
  catalogCache.delete(channelId);
  forgetToken(channelId);
  for (const k of analysisCache.keys()) if (k.startsWith(channelId + "|")) analysisCache.delete(k);
}

const NOT_CONNECTED = "This channel isn’t connected in this browser.";
const GENERIC = "We couldn’t read this channel just now. This is usually temporary, so please try again in a moment.";

/** Access itself is gone: never paper over this with cached data. */
const accessLost = (e: unknown) =>
  e instanceof ReauthError || (e instanceof YouTubeError && (e.status === 401 || (e.status === 403 && e.reason === "insufficientPermissions")));

async function fetchEntry(channelId: string): Promise<Entry | "not-found"> {
  const saved = (await getSession()).channels.find((c) => c.id === channelId);
  if (!saved) return "not-found";
  const started = Date.now();
  const token = await accessTokenFor(saved);
  const info = await fetchOwnChannel(token);
  if (!info || info.id !== channelId) throw new ReauthError("That Google account no longer has this channel. Reconnect the right account.");
  const { videos, partial } = await fetchCatalog(token, info.uploads);
  const { uploads: _uploads, ...channel } = info;
  log("info", "catalog loaded", { channel: channelId, videos: videos.length, partial, ms: Date.now() - started });
  return { at: Date.now(), channel, videos, partial };
}

export async function loadChannel(channelId: string, prefs: Prefs): Promise<LoadResult> {
  const demo = channelId === DEMO_ID;
  const tz = demo ? DEMO_TZ : prefs.tz;
  const metric: MetricKey = prefs.metric;
  let stale: string | null = null;
  let entry: Entry | undefined;
  try {
    // Authorise on EVERY call, before touching the shared in-memory cache: a cached catalog must
    // never be served to a browser that hasn't connected this channel.
    if (!demo && !(await getSession()).channels.some((c) => c.id === channelId)) {
      return { ok: false, kind: "not-found", message: NOT_CONNECTED };
    }
    entry = demo ? { at: 0, channel: demoChannel, videos: demoVideos, partial: false } : catalogCache.get(channelId);
    if (!demo && (!entry || Date.now() - entry.at > (entry.partial ? PARTIAL_TTL : TTL))) {
      const previous = entry;
      try {
        // Concurrent requests (layout, page, prefetches) share one upstream load.
        const fresh = await once(`cat:${channelId}`, () => fetchEntry(channelId));
        if (fresh === "not-found") return { ok: false, kind: "not-found", message: NOT_CONNECTED };
        entry = fresh;
        catalogCache.set(channelId, fresh);
        prune(catalogCache, 24);
      } catch (e) {
        if (accessLost(e)) { dropCache(channelId); throw e; }
        // Serve the last good copy rather than an error page while YouTube or Google is misbehaving.
        if (previous && !(e instanceof ConfigError)) {
          log("warn", "refresh failed, serving stale", { channel: channelId, error: errMsg(e) });
          entry = previous;
          stale = e instanceof YouTubeError || e instanceof UpstreamError ? e.message : "Hindsight will try again on your next visit.";
        } else throw e;
      }
    }
  } catch (e) {
    if (accessLost(e)) {
      return { ok: false, kind: "reauth", message: e instanceof ReauthError ? e.message : "Google access for this channel expired or was revoked. Reconnect it to continue." };
    }
    log("error", "load failed", { channel: channelId, error: errMsg(e), type: e instanceof Error ? e.name : typeof e });
    const message = e instanceof YouTubeError || e instanceof UpstreamError || e instanceof ConfigError ? e.message : GENERIC;
    return { ok: false, kind: "error", message };
  }

  // Analysis is kept apart from loading so a bug in the engine is reported as such, not as a YouTube outage.
  const e = entry!;
  const now = demo ? DEMO_NOW : Date.now();
  const key = `${channelId}|${tz}|${metric}|${e.at}`;
  try {
    let hit = analysisCache.get(key);
    if (!hit) {
      const bundle = await once(`an:${key}`, async () => {
        const t0 = Date.now();
        const b = analyze(e.videos, { tz, metric, now });
        log("info", "analysis complete", { channel: channelId, videos: e.videos.length, tests: b.out.features.length, ms: Date.now() - t0 });
        return b;
      });
      hit = { at: Date.now(), bundle };
      analysisCache.set(key, hit);
      prune(analysisCache, 24);
    }
    return { ok: true, channel: e.channel, videos: e.videos, bundle: hit.bundle, demo, fetchedAt: e.at, tz, now, stale, partial: e.partial };
  } catch (err) {
    log("error", "analysis failed", { channel: channelId, videos: e.videos.length, error: errMsg(err) });
    return { ok: false, kind: "error", message: "Your videos loaded, but the analysis hit an unexpected problem. Please try again; if it keeps happening, try a different metric in Settings." };
  }
}
