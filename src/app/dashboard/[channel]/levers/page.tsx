import type { Metadata } from "next";
import { ChannelError, ChannelHeader, EmptyChannel, DemoNotice } from "@/components/bits";
import { LeversView } from "@/components/levers-view";
import { getData } from "../load";

export const metadata: Metadata = { title: "Levers" };

export default async function Levers({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const { r, signInReady } = await getData(channel);
  if (!r.ok) return <ChannelError kind={r.kind} message={r.message} channelId={channel} />;
  if (r.bundle.out.summary.total === 0) return <EmptyChannel channel={r.channel} />;
  const { out } = r.bundle;
  return (
    <div className="stack">
      <ChannelHeader stale={r.stale} partial={r.partial} exportKind="levers" channel={r.channel} demo={r.demo} fetchedAt={r.fetchedAt} eligible={out.summary.eligible} title="Levers" sub={<span>{r.channel.title}</span>} />
      {r.demo && <DemoNotice signInReady={signInReady} />}
      <p className="lede" style={{ margin: "22px 0 0" }}>
        Every choice you make on an upload is a lever. “No finding” can mean three different things, so Hindsight keeps them apart:
        <b> tested</b> (measured, with a result either way), <b>never varied</b> (you always chose the same thing, so there’s nothing to learn from history), and
        <b> too lopsided</b> (varied, but too rarely to compare fairly). The last two are where untapped upside lives.
      </p>
      <section className="sec" style={{ marginTop: 24 }}>
        <LeversView features={out.features} />
      </section>
    </div>
  );
}
