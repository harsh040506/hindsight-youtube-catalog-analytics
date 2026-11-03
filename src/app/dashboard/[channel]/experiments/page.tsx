import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { ChannelError, ChannelHeader, EmptyChannel, DemoNotice } from "@/components/bits";
import { ActionForm, ICON } from "@/components/ui";
import { designPlans, readExperiment, type Plan } from "@/lib/analytics/experiment";
import { startExperiment, stopExperiment } from "@/lib/actions";
import { date, int, pts } from "@/lib/format";
import { getExperiments } from "@/lib/prefs";
import { getData } from "../load";

export const metadata: Metadata = { title: "Experiments" };

function PlanCard({ p, channel, demo, tracking }: { p: Plan; channel: string; demo: boolean; tracking: boolean }) {
  const start = startExperiment.bind(null, channel, {
    featureKey: p.featureKey,
    control: { name: p.control.name, bucket: p.control.bucket },
    challenger: { name: p.challenger.name, bucket: p.challenger.bucket },
    startedAt: Date.now(),
    perArm: p.perArm,
  });
  return (
    <article className="card stack" style={{ gap: 16 }}>
      <div>
        <span className={`badge ${p.origin === "untested" ? "yellow" : p.origin === "underpowered" ? "violet" : "blue"}`}>{p.origin === "untested" ? "Never tested" : p.origin === "underpowered" ? "Too lopsided to measure" : "Confirm a finding"}</span>
        <h3 style={{ marginTop: 8, fontSize: 20 }}>{p.label}</h3>
        <p className="faint" style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.5, maxWidth: "70ch" }}>{p.rationale}</p>
      </div>
      <div className="arms">
        {[p.control, p.challenger].map((a) => (
          <div className="arm" key={a.id}>
            <div className="tag">Arm {a.id}{a.id === "A" ? " · control" : " · challenger"}</div>
            <div className="n">{a.name}</div>
            <div className="x">{a.detail}</div>
          </div>
        ))}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", margin: 0, fontSize: 13.5 }}>
        <dt className="faint">Sample</dt><dd style={{ margin: 0 }}>{int(p.perArm)} uploads per arm ({int(p.perArm * 2)} total)</dd>
        <dt className="faint">Pace</dt><dd style={{ margin: 0 }}>{p.uploadsPerWeek.toFixed(1)} uploads / week → about {Math.max(1, Math.round(p.weeks))} weeks</dd>
        <dt className="faint">Detects</dt><dd style={{ margin: 0 }}>effects of {p.mde}+ percentile points (80% power, α=0.05)</dd>
        {p.frozen.length > 0 && (<><dt className="faint">Hold fixed</dt><dd style={{ margin: 0 }}>{p.frozen.map((f) => `${f.label} = ${f.value}`).join(" · ")}</dd></>)}
      </dl>
      {!p.feasible && (
        <p className="notice warn" style={{ margin: 0 }}>
          Even the largest effect we size for takes longer than 90 days at your pace. It can still run, but only a big effect will show.
        </p>
      )}
      <div>
        <div className="faint small" style={{ marginBottom: 8 }}>Your next 12 uploads, dealt in balanced random blocks so neither arm gets the same hours or days:</div>
        <div className="sched">{p.schedule.map((a, i) => <span key={i} className={a} title={`Upload ${i + 1}: arm ${a}`}>{a}</span>)}</div>
      </div>
      <details>
        <summary className="faint small" style={{ cursor: "pointer" }}>Sample size by effect size</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl"><thead><tr><th>Detectable effect</th><th className="r">Uploads per arm</th><th className="r">Weeks</th></tr></thead>
            <tbody>{p.sizing.map((s) => <tr key={s.mde}><td>{s.mde} points</td><td className="r">{int(s.perArm)}</td><td className="r">{s.weeks ? Math.round(s.weeks) : "–"}</td></tr>)}</tbody></table>
        </div>
      </details>
      <div>
        {demo ? (
          <span className="faint small">Connect your own channel to track an experiment against real uploads.</span>
        ) : tracking ? (
          <span className="faint small">Stop the active experiment to start a different one.</span>
        ) : (
          <ActionForm action={start as never} success="Tracking started. Publish using the schedule above." label="Start tracking this" icon={<FlaskConical {...ICON} />} btnClass="btn btn-primary" />
        )}
      </div>
    </article>
  );
}

export default async function Experiments({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const { r, signInReady } = await getData(channel);
  if (!r.ok) return <ChannelError kind={r.kind} message={r.message} channelId={channel} />;
  if (r.bundle.out.summary.total === 0) return <EmptyChannel channel={r.channel} />;
  const plans = designPlans(r.bundle, channel, r.now);
  const active = (await getExperiments())[channel];
  const read = active ? readExperiment(r.bundle, active, r.now) : null;
  const activeFeature = active ? r.bundle.out.features.find((f) => f.key === active.featureKey) : null;

  return (
    <div className="stack">
      <ChannelHeader stale={r.stale} partial={r.partial} channel={r.channel} demo={r.demo} fetchedAt={r.fetchedAt} eligible={r.bundle.out.summary.eligible} title="Experiments" sub={<span>{r.channel.title}</span>} />
      {r.demo && <DemoNotice signInReady={signInReady} />}
      <p className="lede" style={{ margin: "22px 0 0" }}>
        History tells you what <i>correlated</i> with performance. A randomised test tells you what <i>caused</i> it. Hindsight picks the levers with the most unrealised value,
        sizes each test to read out within about 90 days at your upload pace, and tells you exactly what to publish next.
      </p>

      {active && read && (
        <section className="sec">
          <header><h2>Running now</h2>
            <ActionForm action={stopExperiment.bind(null, channel) as never} success="Tracking stopped" label="Stop tracking" />
          </header>
          <div className="card stack" style={{ gap: 14 }}>
            <div>
              <h3>{activeFeature?.label ?? active.featureKey}: {active.control.name} vs {active.challenger.name}</h3>
              <div className="faint small">Started {date(active.startedAt)} · uploads younger than 14 days aren’t scored yet</div>
            </div>
            <div className="arms">
              <div className="arm"><div className="tag">Arm A · {active.control.name}</div><div className="n num">{read.nA} <span className="faint">of {read.perArm}</span></div><div className="progress" style={{ marginTop: 8 }}><b style={{ width: `${Math.min(100, (read.nA / read.perArm) * 100)}%` }} /></div></div>
              <div className="arm"><div className="tag">Arm B · {active.challenger.name}</div><div className="n num">{read.nB} <span className="faint">of {read.perArm}</span></div><div className="progress" style={{ marginTop: 8 }}><b style={{ width: `${Math.min(100, (read.nB / read.perArm) * 100)}%` }} /></div></div>
            </div>
            <p style={{ lineHeight: 1.55 }}>{read.verdict}</p>
            {read.warning && <p className="notice warn" style={{ margin: 0 }}>{read.warning}</p>}
            {read.nA > 4 && read.nB > 4 && <p className="faint small num">Difference {pts(read.lift)} points (95% interval {pts(read.ciLow)} to {pts(read.ciHigh)})</p>}
          </div>
        </section>
      )}

      <section className="sec">
        <header><h2>Suggested experiments</h2><p>Ranked by unrealised value: levers you’ve never varied first.</p></header>
        {plans.length ? (
          <div className="list">{plans.map((p) => <PlanCard key={p.featureKey} p={p} channel={channel} demo={r.demo} tracking={Boolean(active)} />)}</div>
        ) : (
          <div className="card"><h3>Not enough history to design a test</h3><p className="lede" style={{ marginTop: 6, fontSize: 14.5 }}>Hindsight needs at least 60 analysable videos to size an experiment. Keep publishing and check back.</p></div>
        )}
      </section>
    </div>
  );
}
