"use client";

import { ArrowDown, ArrowUp, Columns3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ICON, Menu, Segmented } from "./ui";
import type { VideoRow } from "@/lib/analytics/types";
import { date, int } from "@/lib/format";

type Key = "publishedAt" | "title" | "views" | "pct" | "durationS" | "likes" | "comments";
type Col = "durationS" | "likes" | "comments";
const COLS_KEY = "hindsight:video-columns";
const PAGE = 40;

export function VideosTable({ rows, demo, metricLabel }: { rows: VideoRow[]; demo: boolean; metricLabel: string }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "scored">("scored");
  const [key, setKey] = useState<Key>("publishedAt");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState<Record<Col, boolean>>({ durationS: true, likes: false, comments: false });
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
      if (!v || typeof v !== "object") return;
      // Only known columns with boolean values; anything else in storage is ignored.
      setCols((c) => ({ durationS: typeof v.durationS === "boolean" ? v.durationS : c.durationS, likes: typeof v.likes === "boolean" ? v.likes : c.likes, comments: typeof v.comments === "boolean" ? v.comments : c.comments }));
    } catch { /* defaults */ }
  }, []);
  const toggle = (c: Col) => setCols((cur) => { const n = { ...cur, [c]: !cur[c] }; try { localStorage.setItem(COLS_KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = rows.filter((r) => (only === "all" || r.eligible) && (!needle || r.title.toLowerCase().includes(needle)));
    f.sort((a, b) => {
      const x = a[key], y = b[key];
      return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir;
    });
    return f;
  }, [rows, q, only, key, dir]);

  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = view.slice(cur * PAGE, cur * PAGE + PAGE);
  const sort = (k: Key) => { if (k === key) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(k === "title" ? 1 : -1); } setPage(0); };
  const Th = ({ k, children, r }: { k: Key; children: React.ReactNode; r?: boolean }) => (
    <th className={r ? "r" : ""} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => sort(k)}>{children}{key === k && (dir === 1 ? <ArrowUp size={12} strokeWidth={1.75} /> : <ArrowDown size={12} strokeWidth={1.75} />)}</button>
    </th>
  );

  return (
    <>
      <div className="toolbar-row">
        <div className="file-search grow">
          <Search {...ICON} />
          <input className="input" placeholder="Search titles" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search titles" />
        </div>
        <Menu className="btn btn-ghost btn-sm" label="Choose columns" align="end" entries={[
          { type: "header", label: "Columns" },
          { label: "Length", checked: cols.durationS, onSelect: () => toggle("durationS") },
          { label: "Likes", checked: cols.likes, onSelect: () => toggle("likes") },
          { label: "Comments", checked: cols.comments, onSelect: () => toggle("comments") },
        ]}><Columns3 {...ICON} size={14} /> Columns</Menu>
        <Segmented label="Which videos" small value={only} onChange={(v) => { setOnly(v); setPage(0); }} options={[{ value: "scored", label: "Analysed" }, { value: "all", label: "All public" }]} />
      </div>
      <div className="card pad-0">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <Th k="title">Title</Th><Th k="publishedAt">Published</Th>{cols.durationS && <Th k="durationS" r>Length</Th>}<Th k="views" r>Views</Th>{cols.likes && <Th k="likes" r>Likes</Th>}{cols.comments && <Th k="comments" r>Comments</Th>}<Th k="pct" r>Percentile</Th>
            </tr></thead>
            <tbody>
              {slice.map((v) => (
                <tr key={v.id}>
                  <td className="title" title={v.exclusion ?? v.title}>
                    {demo ? v.title : <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">{v.title}</a>}
                    {!v.eligible && <div className="faint small">Not analysed: {v.exclusion}</div>}
                  </td>
                  <td>{date(v.publishedAt)}</td>
                  {cols.durationS && <td className="r">{v.durationS}s</td>}
                  <td className="r">{int(v.views)}</td>
                  {cols.likes && <td className="r">{int(v.likes)}</td>}
                  {cols.comments && <td className="r">{int(v.comments)}</td>}
                  <td className="r"><span className="pct"><i><b style={{ width: `${v.pct}%` }} /></i>{v.pct.toFixed(0)}</span></td>
                </tr>
              ))}
              {!slice.length && <tr><td colSpan={7} className="faint" style={{ textAlign: "center", padding: 28 }}>{q ? <>No videos match “{q}”. <button className="btn btn-ghost btn-sm" onClick={() => setQ("")}>Clear search</button></> : "No videos to show."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{int(view.length)} videos · percentile is vs. neighbours by {metricLabel}</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
            <span className="num">{cur + 1} / {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          </span>
        </div>
      </div>
    </>
  );
}
