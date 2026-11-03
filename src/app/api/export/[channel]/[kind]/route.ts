import { NextRequest, NextResponse } from "next/server";
import { safeFilename, toCsv } from "@/lib/csv";
import { loadChannel } from "@/lib/data";
import { clientIp, isChannelId, rateLimit } from "@/lib/guard";
import { errMsg, log } from "@/lib/log";
import { getPrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string; kind: string }> }) {
  const { channel, kind } = await params;
  if (!isChannelId(channel) || !["videos", "findings", "levers"].includes(kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await rateLimit(`export:${clientIp(req.headers)}`, 30, 60_000)).ok) return NextResponse.json({ error: "Too many exports. Try again in a minute." }, { status: 429 });
  const r = await loadChannel(channel, await getPrefs());
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.kind === "not-found" ? 404 : r.kind === "reauth" ? 401 : 502, headers: { "cache-control": "no-store" } });
  const { out, scored } = r.bundle;

  let csv: string;
  try {
    if (kind === "videos") {
      csv = toCsv(
        ["video_id", "title", "published_utc", "duration_s", "views", "likes", "comments", "percentile", "analysed", "excluded_because"],
        scored.map((s) => [s.video.id, s.video.title, new Date(s.video.publishedAt).toISOString(), s.video.durationS, s.video.views, s.video.likes, s.video.comments, s.percentile.toFixed(1), s.eligible ? "yes" : "no", s.exclusion ?? ""]),
      );
    } else if (kind === "findings") {
      csv = toCsv(
        ["lever", "group", "choice", "videos", "lift_points", "ci_low", "ci_high", "p_value", "q_value", "replicates", "early_lift", "late_lift", "comparison_choice"],
        out.findings.map((f) => [f.featureLabel, f.group, f.bucket, f.n, f.lift.toFixed(2), f.ciLow.toFixed(2), f.ciHigh.toFixed(2), f.p.toFixed(4), f.q.toFixed(4), f.replicates ? "yes" : "no", f.earlyLift?.toFixed(2) ?? "", f.lateLift?.toFixed(2) ?? "", f.comparisonBucket ?? ""]),
      );
    } else {
      csv = toCsv(
        ["lever", "group", "status", "choice", "videos", "mean_percentile", "median_metric", "q_value"],
        out.features.flatMap((f) => f.buckets.map((b) => [f.label, f.group, f.status, b.bucket, b.n, b.meanPct.toFixed(1), b.medianMetric.toFixed(2), b.test ? b.test.q.toFixed(4) : ""])),
      );
    }
  } catch (e) {
    log("error", "csv export failed", { channel, kind, error: errMsg(e) });
    return NextResponse.json({ error: "The export couldn’t be built. Please try again." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hindsight-${safeFilename(r.channel.title)}-${kind}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
