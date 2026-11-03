export interface Video {
  id: string;
  title: string;
  publishedAt: number; // epoch ms
  durationS: number;
  views: number;
  likes: number;
  comments: number;
  tags: string[];
  descLen: number;
  cta: boolean;
  privacy: string;
}

export interface ChannelInfo {
  id: string;
  title: string;
  thumb?: string;
  handle?: string;
  subscribers: number | null;
  views: number;
  videoCount: number;
}

export type MetricKey = "views" | "engagement" | "likes" | "comments";

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: "views",
  engagement: "engagement per 1k views",
  likes: "likes per 1k views",
  comments: "comments per 1k views",
};

export const METRIC_NAMES: Record<MetricKey, string> = {
  views: "Views",
  engagement: "Engagement",
  likes: "Like rate",
  comments: "Comment rate",
};

export interface ScoredVideo {
  video: Video;
  metric: number;
  percentile: number;
  cohortSize: number;
  cohortMedian: number;
  cohortFull: boolean;
  eligible: boolean;
  exclusion: string | null;
}

export interface TestOut {
  lift: number;
  ciLow: number;
  ciHigh: number;
  p: number;
  q: number;
  significant: boolean;
}

export interface BucketOut {
  bucket: string;
  n: number;
  meanPct: number;
  medianMetric: number;
  likePct: number;
  test: TestOut | null;
  examples: { id: string; title: string; metric: number; pct: number }[];
}

export type LeverStatus = "tested" | "untested" | "underpowered";

export interface FeatureOut {
  key: string;
  label: string;
  lever: string;
  group: "metadata" | "title" | "timing";
  description: string;
  status: LeverStatus;
  note: string;
  buckets: BucketOut[];
  spread: number;
}

export interface FindingOut {
  featureKey: string;
  featureLabel: string;
  lever: string;
  group: string;
  bucket: string;
  n: number;
  lift: number;
  ciLow: number;
  ciHigh: number;
  p: number;
  q: number;
  meanPct: number;
  medianMetric: number;
  likePct: number;
  comparisonBucket: string | null;
  comparisonPct: number | null;
  earlyLift: number | null;
  lateLift: number | null;
  replicates: boolean;
  eraNote: string;
}

export interface AnalysisOut {
  metric: MetricKey;
  metricLabel: string;
  tz: string;
  summary: {
    total: number;
    eligible: number;
    excluded: Record<string, number>;
    median: number;
    mean: number;
    max: number;
    total_: number;
  };
  features: FeatureOut[];
  findings: FindingOut[];
  untested: string[]; // feature keys
  underpowered: string[];
  timeline: { t: number; pct: number; smooth: number; views: number; title: string; id: string; eligible: boolean }[];
  top: VideoRow[];
  bottom: VideoRow[];
  params: { halfWidth: number; minAgeDays: number; minBucketN: number; alpha: number; iters: number };
}

export interface VideoRow {
  id: string;
  title: string;
  publishedAt: number;
  durationS: number;
  views: number;
  likes: number;
  comments: number;
  pct: number;
  eligible: boolean;
  exclusion: string | null;
}
