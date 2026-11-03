type Level = "debug" | "info" | "warn" | "error";

/** Field names that must never reach a log line, whatever a caller passes by mistake. */
const SECRET = /token|secret|password|cookie|authorization|email|^rt$|code|verifier/i;

function scrub(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET.test(k)) out[k] = "[redacted]";
    else if (typeof v === "string") out[k] = v.length > 500 ? v.slice(0, 500) + "…" : v;
    else if (typeof v === "bigint") out[k] = v.toString();
    else out[k] = v;
  }
  return out;
}

/** Structured JSON logs (Vercel indexes these). Never pass tokens, cookies or e-mail addresses. Logging never throws. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  let line: string;
  try {
    line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...scrub(fields) });
  } catch {
    line = JSON.stringify({ t: new Date().toISOString(), level, msg, note: "fields not serialisable" });
  }
  try {
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  } catch { /* a broken stdout must not take a request down */ }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
