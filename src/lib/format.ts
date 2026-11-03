export const int = (n: number) => Math.round(n).toLocaleString("en-US");
export const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: n < 10_000 ? 1 : 0 }).format(n);
export const pts = (n: number, d = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`;
// UTC so server and browser render identical text (no hydration mismatch).
export const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
export const metricValue = (n: number, metric: string) => (metric === "views" ? int(n) : n.toFixed(1));
export const plural = (n: number, one: string, many = one + "s") => `${int(n)} ${n === 1 ? one : many}`;
export function ago(ms: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
