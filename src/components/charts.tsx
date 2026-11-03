"use client";

import { useEffect, useRef, useState } from "react";
import type { BucketOut } from "@/lib/analytics/types";

function useWidth(initial = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || initial);
    const ro = new ResizeObserver(() => setW(el.clientWidth || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w] as const;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/* ---------- performance over time ---------- */
export interface TimelinePoint { t: number; pct: number; smooth: number; views: number; title: string; eligible: boolean }

export function TimelineChart({ points, height = 220, label }: { points: TimelinePoint[]; height?: number; label: string }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 3) return <div className="chart-empty">Not enough videos to chart.</div>;
  const padL = 34, padR = 8, padT = 10, padB = 22;
  const iw = Math.max(50, w - padL - padR);
  const ih = height - padT - padB;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (p: number) => padT + (1 - p / 100) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.smooth).toFixed(1)}`).join("");
  const area = `${line}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
  const ticks = 5;
  const hp = hover !== null ? points[hover] : null;

  function move(ev: React.PointerEvent<SVGSVGElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const t = t0 + ((ev.clientX - r.left - padL) / iw) * (t1 - t0);
    let lo = 0, hi = points.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].t < t) lo = m + 1; else hi = m; }
    setHover(Math.max(0, Math.min(points.length - 1, lo)));
  }

  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} className={g === 50 ? "grid mid" : "grid"} />
            <text x={padL - 6} y={y(g) + 4} textAnchor="end" className="axis">{g}</text>
          </g>
        ))}
        {Array.from({ length: ticks }, (_, i) => t0 + ((t1 - t0) * i) / (ticks - 1)).map((t, i) => (
          <text key={i} x={x(t)} y={height - 5} textAnchor={i === 0 ? "start" : i === ticks - 1 ? "end" : "middle"} className="axis">{fmtDate(t)}</text>
        ))}
        {points.map((p, i) => (p.eligible ? <circle key={i} cx={x(p.t)} cy={y(p.pct)} r={1.6} className="dot" /> : null))}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {hp && (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={padT} y2={padT + ih} className="cursor" />
            <circle cx={x(hp.t)} cy={y(hp.smooth)} r={4} className="focus-dot" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hp.t), 90), w - 90), top: 0 }}>
          <strong>{fmtDate(hp.t)}</strong>
          <span>Rolling average {hp.smooth.toFixed(0)}th percentile</span>
          <span className="faint">“{hp.title.length > 44 ? hp.title.slice(0, 43) + "…" : hp.title}” · {hp.pct.toFixed(0)}th</span>
        </div>
      )}
    </div>
  );
}

/* ---------- mean percentile by bucket (publish hour, weekday, …) ---------- */
export function BucketColumns({ buckets, order, height = 190, label }: { buckets: BucketOut[]; order?: string[]; height?: number; label: string }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const slots = order ?? [...buckets].map((b) => b.bucket).sort();
  const list = slots.map((o) => buckets.find((b) => b.bucket === o) ?? ({ bucket: o, n: 0, meanPct: 50, medianMetric: 0, likePct: 50, test: null, examples: [] } as BucketOut));
  if (!buckets.length) return <div className="chart-empty">No data.</div>;
  const padL = 30, padR = 4, padT = 8, padB = 22;
  const iw = Math.max(50, w - padL - padR);
  const ih = height - padT - padB;
  const slot = iw / list.length;
  const bw = Math.max(3, Math.min(26, slot - 3));
  const y = (p: number) => padT + (1 - p / 100) * ih;
  const maxN = Math.max(1, ...list.map((b) => b.n));
  const hb = list.find((b) => b.bucket === hover);
  const every = slot < 22 ? 3 : slot < 40 ? 2 : 1;

  return (
    <div ref={ref} className="chart" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label={label}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} className={g === 50 ? "grid mid" : "grid"} />
            <text x={padL - 6} y={y(g) + 4} textAnchor="end" className="axis">{g}</text>
          </g>
        ))}
        {list.map((b, i) => {
          const cx = padL + slot * i + slot / 2;
          const sig = b.test?.significant;
          const cls = sig ? (b.test!.lift > 0 ? "bar good" : "bar bad") : "bar";
          const top = Math.min(y(b.meanPct), y(50));
          const hgt = Math.abs(y(b.meanPct) - y(50));
          return (
            <g key={b.bucket} onPointerEnter={() => setHover(b.bucket)} onPointerLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={padT} width={slot} height={ih} fill="transparent" />
              {b.n > 0 && <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1.5, hgt)} rx={2} className={cls} style={{ opacity: 0.35 + 0.65 * Math.sqrt(b.n / maxN) }} />}
              {i % every === 0 && <text x={cx} y={height - 6} textAnchor="middle" className="axis">{b.bucket.replace(":00", "")}</text>}
            </g>
          );
        })}
      </svg>
      {hb && hb.n > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(padL + slot * (list.indexOf(hb) + 0.5), 90), w - 90), top: 0 }}>
          <strong>{hb.bucket}</strong>
          <span>{hb.meanPct.toFixed(1)}th percentile · {hb.n} videos</span>
          <span className="faint">{hb.test ? (hb.test.significant ? `significant (q=${hb.test.q.toFixed(3)})` : `not significant (q=${hb.test.q.toFixed(2)})`) : "too few videos to test"}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- horizontal bars for one lever ---------- */
export function BucketBars({ buckets, max = 12 }: { buckets: BucketOut[]; max?: number }) {
  const list = buckets.slice(0, max);
  return (
    <div className="hbars" role="list">
      {list.map((b) => {
        const sig = b.test?.significant;
        const cls = sig ? (b.test!.lift > 0 ? "good" : "bad") : "";
        const left = Math.min(50, b.meanPct);
        const width = Math.abs(b.meanPct - 50);
        return (
          <div key={b.bucket} className="hbar" role="listitem">
            <div className="hbar-name" title={b.bucket}>{b.bucket}</div>
            <div className="hbar-track" aria-hidden>
              <span className="hbar-mid" />
              <span className={`hbar-fill ${cls}`} style={{ left: `${left}%`, width: `${Math.max(0.8, width)}%` }} />
            </div>
            <div className="hbar-val">{b.meanPct.toFixed(0)}<small> · n={b.n}</small></div>
          </div>
        );
      })}
      {buckets.length > max && <div className="faint small">+ {buckets.length - max} more values</div>}
    </div>
  );
}

/* ---------- lift with confidence interval ---------- */
export function LiftRange({ lift, lo, hi, span = 40 }: { lift: number; lo: number; hi: number; span?: number }) {
  const pos = (v: number) => `${50 + (Math.max(-span, Math.min(span, v)) / span) * 50}%`;
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return (
    <div className="lift" role="img" aria-label={`Lift ${lift.toFixed(1)} points, 95% interval ${lo.toFixed(1)} to ${hi.toFixed(1)}`}>
      <span className="lift-zero" />
      <span className="lift-ci" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />
      <span className={`lift-dot ${lift >= 0 ? "good" : "bad"}`} style={{ left: pos(lift) }} />
    </div>
  );
}
