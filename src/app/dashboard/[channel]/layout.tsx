import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Toolbar } from "@/components/toolbar";
import { TimeZoneSync } from "@/components/ui";
import { DEMO_ID } from "@/lib/analytics/demo";
import { syncTimeZone } from "@/lib/actions";
import { authConfigured } from "@/lib/env";
import { isChannelId } from "@/lib/guard";
import { PREFS_COOKIE } from "@/lib/prefs";
import { getSession } from "@/lib/session";

export const maxDuration = 60;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!isChannelId(channel)) notFound();
  const session = await getSession();
  const demo = channel === DEMO_ID;
  const saved = session.channels.find((c) => c.id === channel);
  if (!demo && !saved) redirect("/?error=not-connected");
  const current = demo ? { id: DEMO_ID, title: "Demo channel" } : { id: saved!.id, title: saved!.title, thumb: saved!.thumb };
  // No saved time zone and no edge hint: ask the browser once, so hour-of-day findings are right with zero setup.
  const needTz = !(await cookies()).get(PREFS_COOKIE) && !(await headers()).get("x-vercel-ip-timezone");
  return (
    <div className="app">
      <a href="#content" className="skip">Skip to content</a>
      <Toolbar
        channels={session.channels.map((c) => ({ id: c.id, title: c.title, thumb: c.thumb }))}
        current={current} demo={demo} signInReady={authConfigured()}
      />
      <main className="scroller" id="content" tabIndex={-1}>
        <div className="page is-wide">{children}</div>
      </main>
      <TimeZoneSync sync={syncTimeZone} needed={needTz && !demo} />
    </div>
  );
}
