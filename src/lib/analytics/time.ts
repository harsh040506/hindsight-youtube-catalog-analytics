const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", weekday: "short" });
    cache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Local hour (0-23) and weekday name for an instant in an IANA time zone, DST-correct. */
export function localParts(ms: number, tz: string): { hour: number; dow: string } {
  const parts = fmt(tz).formatToParts(new Date(ms));
  let hour = 0;
  let dow = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = Number(p.value) % 24;
    else if (p.type === "weekday") dow = SHORT[p.value] ?? 0;
  }
  return { hour, dow: DOW[dow] };
}
