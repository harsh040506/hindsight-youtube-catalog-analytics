import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "./env";
import { requestHost } from "./guard";
import { log } from "./log";
import { fetchRetry, once, readJson } from "./net";
import { processWide } from "./process";
import type { SavedChannel } from "./session";

/** Endpoint overrides exist only for the end-to-end test harness (HINDSIGHT_MOCK=1). Ignored otherwise. */
const mock = process.env.HINDSIGHT_MOCK === "1";
export const EP = {
  auth: (mock && process.env.MOCK_AUTH_URL) || "https://accounts.google.com/o/oauth2/v2/auth",
  token: (mock && process.env.MOCK_TOKEN_URL) || "https://oauth2.googleapis.com/token",
  revoke: (mock && process.env.MOCK_REVOKE_URL) || "https://oauth2.googleapis.com/revoke",
};

export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/youtube.readonly"];

export const b64url = (b: Buffer) => b.toString("base64url");
export const newVerifier = () => b64url(randomBytes(32));
export const challengeOf = (v: string) => b64url(createHash("sha256").update(v).digest());

export function authUrl(redirectUri: string, state: string, verifier: string, hint?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // select_account lets people pick a different Google account / brand channel each time
    prompt: "consent select_account",
    state,
    code_challenge: challengeOf(verifier),
    code_challenge_method: "S256",
  });
  if (hint) p.set("login_hint", hint);
  return `${EP.auth}?${p}`;
}

export interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string }

/** The site's own OAuth client is misconfigured (wrong secret, deleted client). Not the user's fault; reconnecting won't help. */
export class ConfigError extends Error {
  constructor() {
    super("Sign-in isn’t working on this site right now. The site owner has been notified; please try again later.");
    this.name = "ConfigError";
  }
}

export class ReauthError extends Error {
  constructor(message = "Google access was revoked or expired. Reconnect this channel.") {
    super(message);
    this.name = "ReauthError";
  }
}

const clientCreds = () => ({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim() });

/** Google's token endpoint reports problems in `error`; split the site's own config errors from the user's grant problems. */
async function tokenFailure(r: Response, label: string): Promise<Error> {
  let code = "";
  try { code = String(((await r.json()) as { error?: unknown })?.error ?? ""); } catch { /* non-JSON error page */ }
  log(r.status >= 500 ? "error" : "warn", `${label} rejected`, { status: r.status, reason: code || undefined });
  if (code === "invalid_client" || code === "unauthorized_client" || code === "redirect_uri_mismatch") {
    log("error", "google oauth client misconfigured: check GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and the redirect URI", { reason: code });
    return new ConfigError();
  }
  if (r.status === 400 || r.status === 401) return new ReauthError();
  return new Error(`Google token endpoint failed (${r.status})`);
}

function validToken(j: unknown): j is TokenResponse {
  const t = j as Partial<TokenResponse> | null;
  return Boolean(t && typeof t.access_token === "string" && t.access_token.length > 0);
}

export async function exchangeCode(code: string, redirectUri: string, verifier: string): Promise<TokenResponse> {
  // An authorization code is single-use: retrying after the server consumed it can only fail, so retry once at most.
  const r = await fetchRetry(EP.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, ...clientCreds(), redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  }, { label: "google.exchange", retries: 1, breaker: "google-token" });
  if (!r.ok) throw await tokenFailure(r, "google.exchange");
  const j = await readJson<unknown>(r, "google.exchange");
  if (!validToken(j)) throw new Error("Google token response had no access token");
  return j;
}

const tokenCache = processWide("tokens", () => new Map<string, { token: string; exp: number; rt: string }>());

/** Forget a channel's cached access token (disconnect, revoked grant, reconnect with a new grant). */
export function forgetToken(channelId: string) {
  tokenCache.delete(channelId);
}

/** Access tokens are minted on demand from the refresh token and cached in memory until shortly before expiry. */
export function accessTokenFor(ch: SavedChannel): Promise<string> {
  const hit = tokenCache.get(ch.id);
  // Keyed by channel but bound to the grant that minted it, so a reconnected channel never reuses an old token.
  if (hit && hit.rt === ch.rt && hit.exp > Date.now() + 60_000) return Promise.resolve(hit.token);
  return once(`tok:${ch.id}:${challengeOf(ch.rt)}`, () => mint(ch));
}

async function mint(ch: SavedChannel): Promise<string> {
  const r = await fetchRetry(EP.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...clientCreds(), refresh_token: ch.rt, grant_type: "refresh_token" }),
  }, { label: "google.refresh", breaker: "google-token" });
  if (!r.ok) {
    forgetToken(ch.id);
    throw await tokenFailure(r, "google.refresh");
  }
  const j = await readJson<unknown>(r, "google.refresh");
  if (!validToken(j)) throw new Error("Google refresh response had no access token");
  const ttl = Number(j.expires_in);
  // A missing or absurd expiry would cache a token forever or never; assume Google's usual hour, capped.
  const life = Number.isFinite(ttl) && ttl > 60 ? Math.min(ttl, 3600) : 3600;
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(ch.id, { token: j.access_token, exp: Date.now() + life * 1000, rt: ch.rt });
  return j.access_token;
}

/** Best effort: a failed revoke is logged, never shown as an error, because the local session is cleared regardless. */
export async function revoke(token: string): Promise<boolean> {
  try {
    const r = await fetchRetry(EP.revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }, { label: "google.revoke", retries: 1, timeoutMs: 5000 });
    // 400 means the grant was already revoked or expired, which is the outcome we wanted.
    if (!r.ok && r.status !== 400) log("warn", "google revoke failed", { status: r.status });
    return r.ok || r.status === 400;
  } catch {
    log("warn", "google revoke unreachable");
    return false;
  }
}

/**
 * The OAuth redirect URI. APP_URL pins it; otherwise it is derived from validated forwarding headers.
 * Google only accepts redirect URIs registered for the client, so a spoofed Host cannot redirect elsewhere.
 */
export function redirectUri(headers: Headers, fallbackOrigin: string): string {
  const pinned = appUrl();
  if (pinned) return `${pinned}/api/auth/callback`;
  const host = requestHost(headers);
  const fwdProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = fwdProto === "http" || fwdProto === "https" ? fwdProto : host?.startsWith("localhost") ? "http" : "https";
  return host ? `${proto}://${host}/api/auth/callback` : `${fallbackOrigin}/api/auth/callback`;
}

/** Public origin of this deployment, derived the same way as the OAuth redirect. */
export function publicOrigin(headers: Headers, fallbackOrigin: string): string {
  try {
    return new URL(redirectUri(headers, fallbackOrigin)).origin;
  } catch {
    return fallbackOrigin;
  }
}
