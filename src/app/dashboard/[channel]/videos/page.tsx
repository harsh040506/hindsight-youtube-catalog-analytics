import type { Metadata } from "next";
import { ChannelError, ChannelHeader, EmptyChannel, DemoNotice } from "@/components/bits";
import { VideosTable } from "@/components/videos-table";
import type { VideoRow } from "@/lib/analytics/types";
import { getData } from "../load";

export const metadata: Metadata = { title: "Videos" };

export default async function Videos({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const { r, signInReady } = await getData(channel);
  if (!r.ok) return <ChannelError kind={r.kind} message={r.message} channelId={channel} />;
  if (r.bundle.out.summary.total === 0) return <EmptyChannel channel={r.channel} />;
  const rows: VideoRow[] = r.bundle.scored.map((s) => ({
    id: s.video.id, title: s.video.title, publishedAt: s.video.publishedAt, durationS: s.video.durationS,
    views: s.video.views, likes: s.video.likes, comments: s.video.comments,
    pct: Math.round(s.percentile * 10) / 10, eligible: s.eligible, exclusion: s.exclusion,
  }));
  return (
    <div className="stack">
      <ChannelHeader stale={r.stale} partial={r.partial} exportKind="videos" channel={r.channel} demo={r.demo} fetchedAt={r.fetchedAt} eligible={r.bundle.out.summary.eligible} title="Videos" sub={<span>{r.channel.title}</span>} />
      {r.demo && <DemoNotice signInReady={signInReady} />}
      <section className="sec" style={{ marginTop: 24 }}>
        <VideosTable rows={rows} demo={r.demo} metricLabel={r.bundle.out.metricLabel} />
      </section>
    </div>
  );
}
