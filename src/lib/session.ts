import { cookies } from "next/headers";
import { open, seal } from "./crypto";
import { authConfigured } from "./env";
import { isChannelId } from "./guard";
import { log } from "./log";

export interface SavedChannel {
  id: string;
  title: string;
  thumb?: string;
  handle?: string;
  email?: string;
  /** Google refresh token. Lives only in an encrypted, httpOnly cookie; Hindsight keeps no database. */
  rt: string;
  /** When this channel was (re)connected; newest first in the switcher. */
  at?: number;
}

export interface SessionData {
  v: 1;
  channels: SavedChannel[];
}

/**
 * Each channel lives in its own sealed cookie, `hs_ch_<channelId>`. Two sign-ins finishing at the same moment
 * (two tabs) then write different cookies instead of overwriting one shared list, and no single cookie
 * approaches the ~4 KB browser limit however many channels are connected.
 */
export const CHANNEL_COOKIE_PREFIX = "hs_ch_";
/** Pre-1.1 single-cookie session. Still read, and migrated to per-channel cookies on the next write. */
export const LEGACY_SESSION_COOKIE = "hs_session";
export const MAX_CHANNELS = 6;
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
/** Leave headroom under the per-cookie browser limit, past which a cookie is silently dropped. */
const COOKIE_BUDGET = 3800;

export const channelCookie = (id: string) => CHANNEL_COOKIE_PREFIX + id;

const EMPTY = (): SessionData => ({ v: 1, channels: [] });
const str = (x: unknown, max: number) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : undefined);
const httpsUrl = (x: unknown) => {
  const s = str(x, 500);
  return s && s.startsWith("https://") ? s : undefined;
};

/** A decrypted cookie is still untrusted: an old app version, a bug, or a key reuse could produce any shape. */
export function sanitizeChannel(x: unknown): SavedChannel | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Record<string, unknown>;
  const id = str(c.id, 40);
  const rt = str(c.rt, 2048);
  if (!id || !isChannelId(id) || id === "demo" || !rt) return null;
  const at = Number(c.at);
  return {
    id, rt, title: str(c.title, 200) ?? "Untitled channel", thumb: httpsUrl(c.thumb), handle: str(c.handle, 60), email: str(c.email, 320),
    at: Number.isFinite(at) && at > 0 ? at : 0,
  };
}

/** Newest first, one entry per channel, never more than MAX_CHANNELS. */
export function normaliseChannels(list: SavedChannel[]): SavedChannel[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, MAX_CHANNELS);
}

/** The legacy single-cookie shape: `{ v: 1, channels: [...] }`, newest first. */
export function sanitizeLegacySession(x: unknown): SavedChannel[] {
  if (!x || typeof x !== "object") return [];
  const o = x as { v?: unknown; channels?: unknown };
  if (o.v !== 1 || !Array.isArray(o.channels)) return [];
  // Legacy entries carry no timestamp; keep their order but rank them below anything connected since.
  return o.channels.map(sanitizeChannel).filter((c): c is SavedChannel => c !== null).map((c, i) => ({ ...c, at: MAX_CHANNELS - i }));
}

/** Pure reader over raw cookie values, so it can be tested without a request. */
export function readSession(all: { name: string; value: string }[]): SessionData {
  const out: SavedChannel[] = [];
  let unreadable = 0;
  for (const { name, value } of all) {
    if (name === LEGACY_SESSION_COOKIE) {
      const legacy = open<unknown>(value);
      if (legacy === null) unreadable++;
      else out.push(...sanitizeLegacySession(legacy));
    } else if (name.startsWith(CHANNEL_COOKIE_PREFIX)) {
      const ch = sanitizeChannel(open<unknown>(value));
      // The cookie name must agree with its sealed contents; a renamed cookie is ignored.
      if (ch && channelCookie(ch.id) === name) out.push(ch);
      else unreadable++;
    }
  }
  // Expected after a secret rotation without SESSION_SECRET_PREVIOUS, or a tampered cookie. The user simply reconnects.
  if (unreadable) log("warn", "session cookies could not be opened", { count: unreadable });
  return { v: 1, channels: normaliseChannels(out) };
}

export async function getSession(): Promise<SessionData> {
  if (!authConfigured()) return EMPTY();
  return readSession((await cookies()).getAll());
}

export function sessionCookieOptions(maxAge = COOKIE_MAX_AGE) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

/** Sealed value for one channel's cookie, or null if it could never fit in a browser cookie. */
export function sealChannel(ch: SavedChannel): string | null {
  const value = seal(ch);
  return value.length + channelCookie(ch.id).length <= COOKIE_BUDGET ? value : null;
}

export interface CookieWriter {
  set(name: string, value: string, opts: ReturnType<typeof sessionCookieOptions>): unknown;
  delete(name: string): unknown;
}

/**
 * Write `next` as the session. `present` is every cookie name the request carried. Writes only the channels in
 * `changed`, deletes every other channel cookie that isn't kept (including overflow from a race), and retires
 * the legacy cookie by re-writing its channels individually. Returns the channels kept, newest first.
 */
export function writeSession(res: CookieWriter, present: string[], next: SavedChannel[], changed: Set<string> = new Set()): SavedChannel[] {
  const hadLegacy = present.includes(LEGACY_SESSION_COOKIE);
  const keep = normaliseChannels(next);
  const keepNames = new Set(keep.map((c) => channelCookie(c.id)));
  for (const c of keep) {
    if (!changed.has(c.id) && !(hadLegacy && !present.includes(channelCookie(c.id)))) continue;
    const value = sealChannel(c);
    if (value) res.set(channelCookie(c.id), value, sessionCookieOptions());
    else log("error", "channel cookie too large to store", { channel: c.id });
  }
  for (const name of present) if (name.startsWith(CHANNEL_COOKIE_PREFIX) && !keepNames.has(name)) res.delete(name);
  if (hadLegacy) res.delete(LEGACY_SESSION_COOKIE);
  return keep;
}
