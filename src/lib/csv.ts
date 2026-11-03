/** RFC 4180 CSV with a guard against spreadsheet formula injection (video titles are user-controlled). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(v);
  // Spreadsheets also evaluate formulas after leading whitespace, so look past it.
  if (typeof v === "string" && /^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const safeFilename = (s: string) => s.normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "channel";
