import type { Metadata } from "next";
import Link from "next/link";
import { ChannelError, ChannelHeader, EmptyChannel, DemoNotice, FindingCard } from "@/components/bits";
import { int } from "@/lib/format";
import { getData } from "../load";

export const metadata: Metadata = { title: "Findings" };

export default async function Findings({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const { r, signInReady } = await getData(channel);
  if (!r.ok) return <ChannelError kind={r.kind} message={r.message} channelId={channel} />;
  if (r.bundle.out.summary.total === 0) return <EmptyChannel channel={r.channel} />;
  const { out } = r.bundle;
  const tests = out.features.reduce((n, f) => n + f.buckets.filter((b) => b.test).length, 0);
  return (
    <div className="stack">
      <ChannelHeader stale={r.stale} partial={r.partial} exportKind="findings" channel={r.channel} demo={r.demo} fetchedAt={r.fetchedAt} eligible={out.summary.eligible} title="Findings" sub={<span>{r.channel.title}</span>} />
      {r.demo && <DemoNotice signInReady={signInReady} />}
      <p className="lede" style={{ margin: "22px 0 0" }}>
        {int(tests)} comparisons were run together across {out.features.length} levers, then corrected for the false alarms you’d expect from that many tests.
        What’s left below is what survives. Effects are in percentile points against each video’s own neighbours, so “+10” means beating an extra 10% of the videos published around it.
      </p>
      <section className="sec" style={{ marginTop: 28 }}>
        {out.findings.length ? (
          <div className="list">{out.findings.map((f) => <FindingCard key={f.featureKey + f.bucket} f={f} metric={out.metric} />)}</div>
        ) : (
          <div className="card">
            <h3>Nothing clears the bar</h3>
            <p className="lede" style={{ marginTop: 6, fontSize: 14.5 }}>
              With {int(out.summary.eligible)} analysable videos and every p-value corrected together, no single choice shows an effect that’s distinguishable from luck.
              This is common, and it is honest: a dashboard would have shown you some “top” bucket anyway. Check <Link href={`/dashboard/${channel}/levers`}>Levers</Link> for choices you’ve never varied.
            </p>
          </div>
        )}
      </section>
      <section className="sec">
        <header><h2>How to read these</h2></header>
        <div className="grid g3">
          <div className="card flat feat"><h3>Replicates</h3><p>The effect points the same way in both the older and newer half of your catalog. That’s what separates a lever from a habit you had during one period.</p></div>
          <div className="card flat feat"><h3>q-value</h3><p>The chance this result is a false alarm after accounting for all the comparisons run together (Benjamini–Hochberg). Findings need q ≤ {out.params.alpha}.</p></div>
          <div className="card flat feat"><h3>Observation, not proof</h3><p>These come from videos you already published, not a randomised test. To be sure, run the experiment: open <Link href={`/dashboard/${channel}/experiments`}>Experiments</Link>.</p></div>
        </div>
      </section>
    </div>
  );
}
