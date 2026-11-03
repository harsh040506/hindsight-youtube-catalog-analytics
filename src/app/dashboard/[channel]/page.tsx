import { ArrowRight, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BucketBars, BucketColumns, TimelineChart } from "@/components/charts";
import { ChannelError, ChannelHeader, EmptyChannel, DemoNotice, findingHeadline } from "@/components/bits";
import { ICON } from "@/components/ui";
import { designPlans } from "@/lib/analytics/experiment";
import { METRIC_LABELS } from "@/lib/analytics/types";
import { date, int, metricValue, plural, pts } from "@/lib/format";
import { getData } from "./load";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const { r, signInReady } = await getData(channel);
  if (!r.ok) return <ChannelError kind={r.kind} message={r.message} channelId={channel} />;
  if (r.bundle.out.summary.total === 0) return <EmptyChannel channel={r.channel} />;
  const { out } = r.bundle;
  const hour = out.features.find((f) => f.key === "publish_hour");
  const dow = out.features.find((f) => f.key === "publish_dow");
  const slot = out.features.find((f) => f.key === "publish_slot");
  const lead = out.findings[0];
  const thin = out.summary.eligible < 60;
  const plan = designPlans(r.bundle, channel, r.now, 1)[0];
  const replicated = out.findings.filter((f) => f.replicates).length;
  const excluded = Object.entries(out.summary.excluded);

  return (
    <div className="stack">
      <ChannelHeader stale={r.stale} partial={r.partial} channel={r.channel} demo={r.demo} fetchedAt={r.fetchedAt} eligible={out.summary.eligible} sub={<span>Time zone <b>{r.tz.replace(/_/g, " ")}</b></span>} />
      {r.demo && <DemoNotice signInReady={signInReady} />}

      {thin && (
        <div className="notice warn" style={{ marginTop: 20 }}>
          <TriangleAlert {...ICON} />
          <div className="grow">
            Only {out.summary.eligible} of {out.summary.total} public videos are old enough to analyse. Hindsight needs roughly 100 or more to say anything reliable, so
            treat everything below as a preview, not a finding.
          </div>
        </div>
      )}

      <section className="sec" style={{ marginTop: 28 }}>
        <div className="grid g4">
          <div className="card stat"><span className="k">Videos analysed</span><span className="v">{int(out.summary.eligible)}</span><span className="s">of {int(out.summary.total)} public</span></div>
          <div className="card stat"><span className="k">Median {out.metric === "views" ? "views" : "score"}</span><span className="v">{metricValue(out.summary.median, out.metric)}</span><span className="s">{out.metric === "views" ? "per video" : METRIC_LABELS[out.metric]}</span></div>
          <div className="card stat"><span className="k">Real findings</span><span className="v">{out.findings.length}</span><span className="s">{replicated} replicate{replicated === 1 ? "s" : ""} across both eras</span></div>
          <div className="card stat"><span className="k">Never varied</span><span className="v">{out.untested.length}</span><span className="s">{out.untested.length ? "untested levers with headroom" : "every lever has been varied"}</span></div>
        </div>
      </section>

      <section className="sec">
        <header><h2>The headline</h2></header>
        {lead ? (
          <div className="card">
            <div style={{ display: "flex", gap: 24, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 44, lineHeight: 1, color: lead.lift > 0 ? "var(--accent-text)" : "var(--danger-text)" }}>{pts(lead.lift)}</div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h3>{findingHeadline(lead)}</h3>
                <p className="lede" style={{ marginTop: 6, fontSize: 14.5 }}>
                  Across {plural(lead.n, "video")}, median {out.metric === "views" ? `${int(lead.medianMetric)} views` : lead.medianMetric.toFixed(1)}. Survives correction for {out.features.length} levers tested together (q={lead.q.toFixed(3)}). {lead.replicates ? "It points the same way in both halves of your catalog." : "It did not replicate cleanly across eras, so treat it as a hypothesis."}
                </p>
              </div>
              <Link href={`/dashboard/${channel}/findings`} className="btn btn-ghost btn-sm">All {out.findings.length} findings <ArrowRight {...ICON} size={14} /></Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <h3>No single choice clears the bar yet</h3>
            <p className="lede" style={{ marginTop: 6, fontSize: 14.5 }}>
              After correcting for {out.features.length} levers tested at once, none shows an effect strong enough to rule out luck. That is a real result, not a failure.
              {out.untested.length ? ` The more useful news: ${out.untested.length} lever${out.untested.length === 1 ? " has" : "s have"} never been varied at all, so they’re the best place to experiment next.` : ""}
            </p>
          </div>
        )}
      </section>

      <section className="sec">
        <header><h2>Performance over time</h2><p>Each video scored against the 50 published nearest to it. 50 is a typical upload; the line is a 15-video rolling average.</p></header>
        <div className="card">
          <TimelineChart points={out.timeline} label="Rolling average percentile of videos over time" />
        </div>
      </section>

      {hour && hour.buckets.length > 1 && (
        <section className="sec">
          <header><h2>When you publish</h2><p>Average percentile by hour in {r.tz.replace(/_/g, " ")}. Solid colour means the result survives multiple-testing correction.</p></header>
          <div className="card">
            <BucketColumns buckets={hour.buckets} order={Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)} label="Average percentile by publish hour" />
            <p className="visually-hidden">Hour-by-hour averages: {hour.buckets.slice(0, 24).map((b) => `${b.bucket} ${b.meanPct.toFixed(0)}th percentile (${b.n} videos)`).join(", ")}.</p>
            <div className="legend"><span><i className="good" />Significantly better</span><span><i className="bad" />Significantly worse</span><span><i />No reliable difference · faded = fewer videos</span></div>
          </div>
          <div className="grid g2" style={{ marginTop: 14 }}>
            {dow && <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Day of week</h3><BucketBars buckets={dow.buckets} /></div>}
            {slot && <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Time of day</h3><BucketBars buckets={slot.buckets} /></div>}
          </div>
        </section>
      )}

      <section className="sec">
        <header><h2>Best and weakest uploads</h2><p>Relative to their own neighbours, not raw views.</p></header>
        <div className="grid g2">
          {[{ t: "Outperformed their cohort", rows: out.top }, { t: "Underperformed their cohort", rows: out.bottom }].map((g) => (
            <div key={g.t} className="card pad-0">
              <div style={{ padding: "14px 18px 6px", fontWeight: 500 }}>{g.t}</div>
              <div className="table-wrap">
                <table className="tbl"><tbody>
                  {g.rows.map((v) => (
                    <tr key={v.id}>
                      <td className="title" style={{ maxWidth: 260 }} title={v.title}>
                        {r.demo ? v.title : <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">{v.title}</a>}
                        <div className="faint small">{date(v.publishedAt)}</div>
                      </td>
                      <td className="r">{int(v.views)}<div className="faint small">views</div></td>
                      <td className="r">{v.pct.toFixed(0)}<div className="faint small">pct</div></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {plan && (
        <section className="sec">
          <header><h2>What to test next</h2></header>
          <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span className={`badge ${plan.origin === "untested" ? "yellow" : plan.origin === "underpowered" ? "violet" : "blue"}`}>{plan.origin === "untested" ? "Never tested" : plan.origin === "underpowered" ? "Too lopsided to measure" : "Confirm a finding"}</span>
              <h3 style={{ marginTop: 8 }}>{plan.label}: {plan.control.name} vs {plan.challenger.name}</h3>
              <p className="faint" style={{ marginTop: 4, fontSize: 13.5 }}>{plan.perArm} uploads per arm · about {Math.max(1, Math.round(plan.weeks))} weeks at your pace · detects ≥{plan.mde} points</p>
            </div>
            <Link href={`/dashboard/${channel}/experiments`} className="btn btn-primary">Design this experiment <ArrowRight {...ICON} /></Link>
          </div>
        </section>
      )}

      {excluded.length > 0 && (
        <p className="faint small" style={{ marginTop: 32 }}>
          Not analysed: {excluded.map(([why, n]) => `${int(n)} ${why}`).join("; ")}. Only public videos are used. Last video analysed: {date(Math.max(...out.timeline.map((t) => t.t)))}.
        </p>
      )}
    </div>
  );
}
