import { NextRequest, NextResponse } from "next/server";
import { dropCache } from "@/lib/data";
import { publicOrigin, revoke } from "@/lib/google";
import { clientIp, isChannelId, rateLimit, sameOrigin } from "@/lib/guard";
import { log } from "@/lib/log";
import { getSession, writeSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST with optional form field `channel` to disconnect one channel; without it, disconnect all. Safe to repeat. */
export async function POST(req: NextRequest) {
  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  if (!sameOrigin(req.headers)) {
    log("warn", "cross-site logout refused");
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  if (!(await rateLimit(`logout:${clientIp(req.headers)}`, 20, 60_000)).ok) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const raw = form?.get("channel");
  const only = typeof raw === "string" && raw ? raw : null;
  // A malformed channel id must not fall through to "disconnect everything".
  if (only !== null && !isChannelId(only)) return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  const session = await getSession();
  const gone = only ? session.channels.filter((c) => c.id === only) : session.channels;
  // The local session is cleared whatever Google says; a failed revoke is logged and the grant expires on its own.
  const revoked = await Promise.all(gone.map((c) => revoke(c.rt)));
  gone.forEach((c) => dropCache(c.id));
  const left = session.channels.filter((c) => !gone.includes(c));
  log("info", "channels disconnected", { removed: gone.length, left: left.length, revokeFailed: revoked.filter((ok) => !ok).length });
  const res = NextResponse.redirect(new URL(left.length ? `/dashboard/${left[0].id}/settings?disconnected=1` : "/?signedout=1", origin), 303);
  writeSession(res.cookies, req.cookies.getAll().map((c) => c.name), left);
  return res;
}
