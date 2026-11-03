import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { seal } from "@/lib/crypto";
import { authConfigured } from "@/lib/env";
import { authUrl, newVerifier, publicOrigin, redirectUri } from "@/lib/google";
import { clientIp, rateLimit } from "@/lib/guard";
import { errMsg, log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  if (!authConfigured()) return NextResponse.redirect(new URL("/?error=not-configured", origin));
  const rl = await rateLimit(`auth:${clientIp(req.headers)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.redirect(new URL("/?error=busy", origin));

  // `hint` pre-selects the Google account when reconnecting a known channel.
  const raw = req.nextUrl.searchParams.get("hint") ?? "";
  const hint = /^[^\s@]{1,64}@[^\s@]{1,255}$/.test(raw) ? raw : undefined;

  try {
    const state = randomBytes(16).toString("base64url");
    const verifier = newVerifier();
    log("info", "oauth start");
    const res = NextResponse.redirect(authUrl(redirectUri(req.headers, req.nextUrl.origin), state, verifier, hint));
    res.cookies.set("hs_oauth", seal({ state, verifier }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
    });
    return res;
  } catch (e) {
    log("error", "oauth start failed", { error: errMsg(e) });
    return NextResponse.redirect(new URL("/?error=not-configured", origin));
  }
}
