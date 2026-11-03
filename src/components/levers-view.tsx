"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { BucketBars } from "./charts";
import { Segmented } from "./ui";
import type { FeatureOut, LeverStatus } from "@/lib/analytics/types";

const GROUPS = [
  { value: "all", label: "All" },
  { value: "timing", label: "Timing" },
  { value: "title", label: "Title" },
  { value: "metadata", label: "Metadata" },
] as const;
const STATUSES = [
  { value: "all", label: "Any status" },
  { value: "tested", label: "Tested" },
  { value: "untested", label: "Never varied" },
  { value: "underpowered", label: "Too lopsided" },
] as const;

const badge = (s: LeverStatus) =>
  s === "tested" ? <span className="badge blue">Tested</span> : s === "untested" ? <span className="badge yellow">Never varied</span> : <span className="badge violet">Too lopsided</span>;

export function LeversView({ features }: { features: FeatureOut[] }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]["value"]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["value"]>("all");
  const rank = { untested: 0, tested: 1, underpowered: 2 } as const;
  const list = useMemo(
    () =>
      features
        .filter((f) => (group === "all" || f.group === group) && (status === "all" || f.status === status))
        .sort((a, b) => rank[a.status] - rank[b.status] || b.spread - a.spread),
    [features, group, status], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <>
      <div className="toolbar-row">
        <Segmented label="Group" small value={group} options={[...GROUPS]} onChange={setGroup} />
        <Segmented label="Status" small value={status} options={[...STATUSES]} onChange={setStatus} />
        <span className="faint small">{list.length} of {features.length} levers</span>
      </div>
      <div className="list" style={{ gap: 10 }}>
        {list.map((f) => (
          <details key={f.key} className="card lever" open={f.status === "untested" && list.length <= 6}>
            <summary>
              <span className="t">{f.label}</span>
              <span className="chev">
                {badge(f.status)}
                {f.status === "tested" && <span className="faint small num">spread {f.spread.toFixed(0)} pts</span>}
                <ChevronDown size={16} strokeWidth={1.5} />
              </span>
              <span className="d">{f.lever}</span>
            </summary>
            <div className="lever-body">
              {f.note && <p className="note">{f.note}</p>}
              <p className="faint small">{f.description}</p>
              <BucketBars buckets={f.buckets} />
            </div>
          </details>
        ))}
        {!list.length && <div className="card"><span className="faint">No levers match.</span></div>}
      </div>
    </>
  );
}
