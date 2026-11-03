import { Download, Film, Info, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LiftRange } from "./charts";
import { ActionForm, ICON } from "./ui";
import type { ChannelInfo, FindingOut, LeverStatus } from "@/lib/analytics/types";
import { refreshChannel } from "@/lib/actions";
import { getSession } from "@/lib/session";
import { compact, date, int, pts } from "@/lib/format";

export function ChannelHeader({ channel, demo, fetchedAt, eligible, title, sub, stale, partial, exportKind }: { channel: ChannelInfo; demo: boolean; fetchedAt: number; eligible: number; title?: string; sub?: ReactNode; stale?: string | null; partial?: boolean; exportKind?: "videos" | "findings" | "levers" }) {
  return (
    <>
    {stale != null && (
      <div className="notice warn" role="status" style={{ marginBottom: 16 }}>
        <TriangleAlert {...ICON} /><div className="grow">YouTube didn’t respond just now, so this is the copy from {date(fetchedAt)}. {stale}</div>
      </div>
    )}
    {partial && (
      <div className="notice warn" role="status" style={{ marginBottom: 16 }}>
        <TriangleAlert {...ICON} /><div className="grow">YouTube was slow, so only your most recent uploads were read this time. The analysis covers those; press Refresh in a few minutes to read the full catalog.</div>
      </div>
    )}
    <div className="page-head">
      <div>
        <div className="channel-id">
          {channel.thumb ? <img src={channel.thumb} alt="" referrerPolicy="no-referrer" /> : <div className="ph" />}
          <div>
            <h1>{title ?? channel.title}</h1>
            {channel.handle && <div className="faint small">{channel.handle}</div>}
          </div>
        </div>
        <div className="meta">
          {channel.subscribers !== null && <span><b>{compact(channel.subscribers)}</b> subscribers</span>}
          <span><b>{compact(channel.views)}</b> lifetime views</span>
          <span><b>{int(channel.videoCount)}</b> videos</span>
          <span><b>{int(eligible)}</b> analysed</span>
          {sub}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {exportKind && <a className="btn btn-ghost btn-sm" href={`/api/export/${channel.id}/${exportKind}`} download><Download {...ICON} size={14} /> Export CSV</a>}
        {!demo && (
          <ActionForm action={refreshChannel.bind(null, channel.id)} success="Refreshed from YouTube" label="Refresh" icon={<RefreshCw {...ICON} size={14} />} tip="Re-read your channel from YouTube" />
        )}
      </div>
    </div>
    </>
  );
}

export function EmptyChannel({ channel }: { channel: ChannelInfo }) {
  return (
    <div className="center-page">
      <Film size={22} strokeWidth={1.5} />
      <h2>No public videos yet</h2>
      <p className="lede">{channel.title} doesn’t have any public videos for Hindsight to read. Private and unlisted videos are never analysed. Publish a few (about 100 gives reliable findings), then press Refresh.</p>
      <Link href="/dashboard/demo" className="btn btn-ghost">See what a full analysis looks like</Link>
    </div>
  );
}

export function DemoNotice({ signInReady }: { signInReady: boolean }) {
  return (
    <div className="notice" style={{ marginTop: 20 }}>
      <Info {...ICON} />
      <div className="grow">
        You’re looking at a bundled sample: an anonymised real catalog of 949 videos, analysed in UTC+5:30.{" "}
        {signInReady ? <a href="/api/auth/google">Connect your own channel</a> : "Connect your own channel once sign-in is configured."}
      </div>
    </div>
  );
}

export async function ChannelError({ kind, message, channelId }: { kind: "not-found" | "reauth" | "error"; message: string; channelId: string }) {
  const email = (await getSession()).channels.find((c) => c.id === channelId)?.email;
  return (
    <div className="center-page">
      <TriangleAlert size={22} strokeWidth={1.5} />
      <h2>{kind === "reauth" ? "Reconnect this channel" : kind === "not-found" ? "Channel not found" : "Couldn’t read this channel"}</h2>
      <p className="lede">{message}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {kind === "reauth" && <a href={`/api/auth/google${email ? `?hint=${encodeURIComponent(email)}` : ""}`} className="btn btn-primary">Reconnect with Google</a>}
        {kind === "error" && <Link href={`/dashboard/${channelId}`} className="btn btn-primary">Try again</Link>}
        <Link href="/dashboard/demo" className="btn btn-ghost">Open the sample</Link>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: LeverStatus }) {
  if (status === "tested") return <span className="badge blue">Tested</span>;
  if (status === "untested") return <span className="badge yellow">Never varied</span>;
  return <span className="badge violet">Too lopsided to measure</span>;
}

export function findingHeadline(f: FindingOut): string {
  const verb = f.lift > 0 ? "gains" : "costs";
  const amt = `${Math.abs(f.lift).toFixed(1)} percentile points`;
  if (f.featureKey === "publish_hour") return `Publishing at ${f.bucket} ${verb} ${amt}`;
  if (f.featureKey === "publish_dow") return `Publishing on ${f.bucket} ${verb} ${amt}`;
  return `${f.featureLabel}: “${f.bucket}” ${verb} ${amt}`;
}

export function FindingCard({ f, metric }: { f: FindingOut; metric: string }) {
  const good = f.lift > 0;
  return (
    <article className="card finding">
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <span className="badge">{f.group}</span>
          {f.replicates ? <span className="badge green">Replicates</span> : <span className="badge yellow">Not confirmed on both halves</span>}
        </div>
        <h3>{findingHeadline(f)}</h3>
        <p className="faint" style={{ marginTop: 4, fontSize: 13.5 }}>Lever: {f.lever.toLowerCase()}.</p>
        <p className="era">{f.eraNote}</p>
      </div>
      <div>
        <div className={`big finding-big ${good ? "good" : "bad"}`} style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1 }}>{pts(f.lift)}</div>
        <div className="faint small" style={{ margin: "4px 0 10px" }}>percentile points vs. your other uploads</div>
        <LiftRange lift={f.lift} lo={f.ciLow} hi={f.ciHigh} />
        <dl>
          <dt>Videos</dt><dd>{int(f.n)}</dd>
          <dt>95% interval</dt><dd>{pts(f.ciLow)} to {pts(f.ciHigh)}</dd>
          <dt>q-value</dt><dd>{f.q < 0.001 ? "<0.001" : f.q.toFixed(3)}</dd>
          <dt>Median {metric === "views" ? "views" : "score"}</dt><dd>{metric === "views" ? int(f.medianMetric) : f.medianMetric.toFixed(1)}</dd>
          {f.comparisonBucket && (<><dt>Weakest option</dt><dd>{f.comparisonBucket}</dd></>)}
        </dl>
      </div>
    </article>
  );
}
