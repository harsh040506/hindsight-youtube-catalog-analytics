import type { ChannelInfo, Video } from "./analytics/types";
import { isChannelId } from "./guard";
import { log } from "./log";
import { fetchRetry, readJson } from "./net";

const API = (process.env.HINDSIGHT_MOCK === "1" && process.env.MOCK_YT_URL) || "https://www.googleapis.com/youtube/v3";
export const MAX_VIDEOS = 5000;
/** Stop reading new pages after this long so a slow API can't push the request past the serverless limit. */
export const CATALOG_BUDGET_MS = 40_000;

export class YouTubeError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) {
    super(message);
    this.name = "YouTubeError";
  }
}

async function yt<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const r = await fetchRetry(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  }, { label: `youtube.${path}`, breaker: "youtube" });
  if (!r.ok) {
    let reason: string | undefined;
    try {
      const j = (await r.json()) as { error?: { errors?: { reason?: unknown }[] } };
      const raw = j?.error?.errors?.[0]?.reason;
      reason = typeof raw === "string" ? raw.slice(0, 60) : undefined;
    } catch { /* non-JSON error page */ }
    // Google's own error text is logged for the owner but never shown: it can be technical or leak request details.
    log(r.status >= 500 ? "error" : "warn", "youtube api error", { path, status: r.status, reason });
    const friendly =
      reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "dailyLimitExceeded" ? "YouTube’s daily API quota for this app is used up. Please try again tomorrow."
      : r.status === 403 && reason === "insufficientPermissions" ? "Hindsight doesn’t have permission to read this channel. Reconnect it and allow YouTube access."
      : r.status === 403 && (reason === "accessNotConfigured" || reason === "forbidden") ? "This site’s YouTube access isn’t set up correctly. Please try again later."
      : r.status === 404 ? "YouTube couldn’t find this channel’s uploads. If you recently deleted or renamed the channel, reconnect it."
      : r.status >= 500 ? "YouTube is having trouble right now. Please try again in a minute."
      : "YouTube couldn’t complete the request. Please try again in a minute.";
    throw new YouTubeError(friendly, r.status, reason);
  }
  return readJson<T>(r, `youtube.${path}`);
}

/* ---------- defensive field readers: the API omits fields freely (hidden counts, deleted videos, livestreams) ---------- */
const text = (x: unknown, max = 500) => (typeof x === "string" ? x.slice(0, max) : "");
const count = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const VIDEO_ID = /^[\w-]{6,20}$/;

interface ChannelsResp {
  items?: {
    id?: string;
    snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
    statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
}

export async function fetchOwnChannel(token: string): Promise<(ChannelInfo & { uploads: string }) | null> {
  const j = await yt<ChannelsResp>("channels", { part: "snippet,statistics,contentDetails", mine: "true" }, token);
  const c = Array.isArray(j?.items) ? j.items[0] : undefined;
  if (!c) return null;
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (!c.id || !isChannelId(c.id) || c.id === "demo" || typeof uploads !== "string" || !uploads) {
    log("error", "youtube channel response missing required fields", { hasId: Boolean(c.id), hasUploads: Boolean(uploads) });
    throw new YouTubeError("YouTube returned incomplete channel details. Please try again in a minute.", 502);
  }
  const thumb = c.snippet?.thumbnails?.default?.url;
  return {
    id: c.id,
    title: text(c.snippet?.title, 200) || "Untitled channel",
    thumb: typeof thumb === "string" && thumb.startsWith("https://") ? thumb : undefined,
    handle: text(c.snippet?.customUrl, 60) || undefined,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : count(c.statistics?.subscriberCount),
    views: count(c.statistics?.viewCount),
    videoCount: count(c.statistics?.videoCount),
    uploads,
  };
}

export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(typeof iso === "string" ? iso : "");
  if (!m) return 0;
  const s = Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return Number.isFinite(s) ? s : 0;
}

const CTA = ["comment ", "share this", "send this", "follow @", "subscribe", "tag someone", "save this"];

interface PlaylistResp { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }
interface VideosResp {
  items?: {
    id?: string;
    snippet?: { title?: string; description?: string; publishedAt?: string; tags?: unknown };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    status?: { privacyStatus?: string };
  }[];
}

/** Turn one API item into a Video, or null if it is too broken to analyse (no id, no parseable publish time). */
export function toVideo(v: NonNullable<VideosResp["items"]>[number]): Video | null {
  if (!v || typeof v.id !== "string" || !VIDEO_ID.test(v.id)) return null;
  const publishedAt = Date.parse(text(v.snippet?.publishedAt, 40));
  if (!Number.isFinite(publishedAt)) return null;
  const description = text(v.snippet?.description, 10_000);
  const tags = Array.isArray(v.snippet?.tags) ? (v.snippet.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 100).map((t) => t.slice(0, 100)) : [];
  const desc = description.toLowerCase();
  return {
    id: v.id,
    title: text(v.snippet?.title, 300),
    publishedAt,
    durationS: parseDuration(text(v.contentDetails?.duration, 40)),
    views: count(v.statistics?.viewCount),
    likes: count(v.statistics?.likeCount),
    comments: count(v.statistics?.commentCount),
    tags,
    descLen: description.length,
    cta: CTA.some((s) => desc.includes(s)),
    privacy: text(v.status?.privacyStatus, 20) || "unknown",
  };
}

export interface Catalog { videos: Video[]; partial: boolean; skipped: number }

export async function fetchCatalog(token: string, uploadsPlaylist: string, budgetMs = CATALOG_BUDGET_MS): Promise<Catalog> {
  const deadline = Date.now() + budgetMs;
  const ids: string[] = [];
  const seenIds = new Set<string>();
  const seenPages = new Set<string>();
  let page: string | undefined;
  let partial = false;
  do {
    if (Date.now() > deadline) { partial = true; break; }
    const j = await yt<PlaylistResp>("playlistItems", {
      part: "contentDetails", playlistId: uploadsPlaylist, maxResults: "50", ...(page ? { pageToken: page } : {}),
    }, token);
    for (const it of Array.isArray(j?.items) ? j.items : []) {
      const id = it?.contentDetails?.videoId;
      if (typeof id === "string" && VIDEO_ID.test(id) && !seenIds.has(id)) { seenIds.add(id); ids.push(id); }
    }
    const next = typeof j?.nextPageToken === "string" && j.nextPageToken ? j.nextPageToken : undefined;
    // A repeated page token would loop forever and burn the quota.
    if (next && seenPages.has(next)) { log("warn", "youtube pagination repeated a page token"); break; }
    if (next) seenPages.add(next);
    page = next;
  } while (page && ids.length < MAX_VIDEOS);
  ids.length = Math.min(ids.length, MAX_VIDEOS);

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const out: Video[] = [];
  let skipped = 0;
  // 5 requests in flight keeps big channels well inside the serverless time limit
  for (let i = 0; i < batches.length; i += 5) {
    if (Date.now() > deadline && out.length) { partial = true; break; }
    const res = await Promise.all(
      batches.slice(i, i + 5).map((b) =>
        yt<VideosResp>("videos", { part: "snippet,contentDetails,statistics,status", id: b.join(","), maxResults: "50" }, token),
      ),
    );
    for (const j of res) {
      for (const item of Array.isArray(j?.items) ? j.items : []) {
        const v = toVideo(item);
        if (v) out.push(v);
        else skipped++;
      }
    }
  }
  if (skipped) log("warn", "youtube returned unusable videos", { skipped });
  if (partial) log("warn", "catalog read stopped at time budget", { read: out.length, listed: ids.length });
  return { videos: out, partial, skipped };
}
