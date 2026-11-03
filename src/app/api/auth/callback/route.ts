import { NextRequest, NextResponse } from "next/server";
import { open } from "@/lib/crypto";
import { authConfigured } from "@/lib/env";
import { ConfigError, exchangeCode, forgetToken, publicOrigin, redirectUri } from "@/lib/google";
import { clientIp, rateLimit } from "@/lib/guard";
import { errMsg, log } from "@/lib/log";
import { UpstreamError } from "@/lib/net";
import { getSession, sealChannel, writeSession } from "@/lib/session";
import { fetchOwnChannel, YouTubeError } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** The e-mail claim is only a convenience for "reconnect" hints; any problem just leaves it out. */
function emailFrom(idToken: string | undefined): string | undefined {
  try {
    const part = idToken?.split(".")[1];
    if (!part || part.length > 8192) return undefined;
    const email = (JSON.parse(Buffer.from(part, "base64url").toString()) as { email?: unknown }).email;
    return typeof email === "string" && EMAIL.test(email) ? email : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  const back = (error: string) => {
    const res = NextResponse.redirect(new URL(`/?error=${error}`, origin));
    res.cookies.delete("hs_oauth");
    return res;
  };
  if (!authConfigured()) return back("not-configured");
  if (!(await rateLimit(`cb:${clientIp(req.headers)}`, 20, 60_000)).ok) return back("busy");

  const q = req.nextUrl.searchParams;
  const gErr = q.get("error");
  if (gErr) {
    log("info", "oauth declined at google", { reason: gErr.slice(0, 40) });
    return back(gErr === "access_denied" ? "denied" : "google");
  }
  const code = q.get("code");
  const saved = open<{ state?: unknown; verifier?: unknown }>(req.cookies.get("hs_oauth")?.value);
  if (!code || code.length > 2048 || !saved || typeof saved.state !== "string" || typeof saved.verifier !== "string" || saved.state !== q.get("state")) {
    log("warn", "oauth state check failed", { hasCode: Boolean(code), hasCookie: Boolean(saved) });
    return back("state");
  }

  try {
    const tok = await exchangeCode(code, redirectUri(req.headers, req.nextUrl.origin), saved.verifier);
    if (!tok.scope?.split(" ").some((s) => s.endsWith("/youtube.readonly"))) return back("scope");
    const info = await fetchOwnChannel(tok.access_token);
    if (!info) return back("no-channel");

    const session = await getSession();
    const existing = session.channels.find((c) => c.id === info.id);
    const rt = tok.refresh_token ?? existing?.rt;
    if (!rt) return back("no-refresh");

    const channel = { id: info.id, title: info.title.slice(0, 80), thumb: info.thumb, handle: info.handle?.slice(0, 40), email: emailFrom(tok.id_token), rt, at: Date.now() };
    if (!sealChannel(channel)) return back("google");
    const res = NextResponse.redirect(new URL(`/dashboard/${info.id}`, origin));
    // Only this channel's cookie is written, so a sign-in finishing in another tab can't be overwritten.
    // Channels pushed past MAX_CHANNELS lose their cookie but their grants are deliberately NOT revoked: Google
    // revokes a whole grant, which would also break that channel in the user's other browsers.
    const kept = writeSession(res.cookies, req.cookies.getAll().map((c) => c.name), [channel, ...session.channels.filter((c) => c.id !== info.id)], new Set([info.id]));
    const dropped = session.channels.length + (existing ? 0 : 1) - kept.length;
    forgetToken(info.id);
    log("info", "channel connected", { channel: info.id, total: kept.length, dropped: Math.max(0, dropped) });
    res.cookies.delete("hs_oauth");
    return res;
  } catch (e) {
    log("error", "oauth callback failed", { error: errMsg(e), type: e instanceof Error ? e.name : typeof e });
    if (e instanceof ConfigError) return back("not-configured");
    if (e instanceof YouTubeError && e.reason === "quotaExceeded") return back("quota");
    if (e instanceof UpstreamError || (e instanceof YouTubeError && e.status >= 500)) return back("unavailable");
    return back("google");
  }
}
