import { describe, expect, it } from "vitest";
import { analyze } from "../src/lib/analytics/analyze";
import { benjaminiHochberg, inverseNormalCdf, requiredSampleSize } from "../src/lib/analytics/stats";
import { demoVideos, DEMO_TZ } from "../src/lib/analytics/demo";

describe("stats", () => {
  it("BH matches the textbook example", () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
    expect(q.map((x) => +x.toFixed(4))).toEqual([0.02, 0.04, 0.04, 0.02]);
  });
  it("inverse normal CDF", () => {
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.95996, 3);
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
  });
  it("sample size grows as the effect shrinks", () => {
    expect(requiredSampleSize(29, 5)).toBeGreaterThan(requiredSampleSize(29, 10));
    expect(requiredSampleSize(29, 10)).toBe(Math.ceil((2 * (1.959964 + 0.841621) ** 2 * 29 ** 2) / 100));
  });
});

describe("demo catalog (reproduces the published findings)", () => {
  const { out } = analyze(demoVideos, { tz: DEMO_TZ, metric: "views", now: Date.parse("2026-08-16T00:00:00Z") });
  it("analyses ~845 videos", () => {
    expect(out.summary.eligible).toBeGreaterThan(800);
    expect(out.summary.eligible).toBeLessThan(900);
  });
  it("finds the 01:00 penalty and 12:00 bonus", () => {
    const h1 = out.findings.find((f) => f.featureKey === "publish_hour" && f.bucket === "01:00");
    const h12 = out.findings.find((f) => f.featureKey === "publish_hour" && f.bucket === "12:00");
    expect(h1?.lift).toBeLessThan(-8);
    expect(h12?.lift).toBeGreaterThan(8);
  });
  it("flags the tag set as never varied", () => {
    expect(out.untested).toContain("tag_set");
  });
});

import { designPlans, readExperiment } from "../src/lib/analytics/experiment";

describe("experiment design", () => {
  const now = Date.parse("2026-08-16T00:00:00Z");
  const bundle = analyze(demoVideos, { tz: DEMO_TZ, metric: "views", now });
  it("proposes never-varied levers first and sizes them", () => {
    const plans = designPlans(bundle, "demo", now);
    expect(plans[0].origin).toBe("untested");
    expect(plans[0].featureKey).toBe("tag_set");
    expect(plans[0].perArm).toBeGreaterThan(10);
    expect(plans[0].schedule).toHaveLength(12);
    // balanced blocks of four: each aligned block has two of each arm
    for (let i = 0; i < 12; i += 4) expect(plans[0].schedule.slice(i, i + 4).filter((a) => a === "A")).toHaveLength(2);
  });
  it("is deterministic", () => {
    expect(designPlans(bundle, "demo", now)[0].schedule).toEqual(designPlans(bundle, "demo", now)[0].schedule);
  });
  it("reads an experiment out of the catalog", () => {
    const r = readExperiment(bundle, { featureKey: "publish_hour", control: { name: "01:00", bucket: "01:00" }, challenger: { name: "12:00", bucket: "12:00" }, startedAt: Date.parse("2025-07-01"), perArm: 40 }, now);
    expect(r.nA).toBeGreaterThan(20);
    expect(r.nB).toBeGreaterThan(20);
    expect(r.lift).toBeGreaterThan(10);
  });
});

import { csvCell, safeFilename, toCsv } from "../src/lib/csv";
import { rateLimit, isChannelId, sameOrigin } from "../src/lib/guard";
import { seal, open } from "../src/lib/crypto";
import { parseDuration } from "../src/lib/youtube";
import { fetchRetry, once } from "../src/lib/net";
import { sanitizeExperiment } from "../src/lib/prefs";
import { channelCookie, readSession, sealChannel, writeSession, type SavedChannel } from "../src/lib/session";

describe("csv", () => {
  it("neutralises spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-5+3")).toBe("'-5+3");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv(["a"], [["x"]])).toContain("a\r\nx\r\n");
  });
  it("sanitises filenames", () => expect(safeFilename("../../etc/passwd é")).toBe("etc_passwd_e"));
});

describe("guards", () => {
  it("rate limits within a window", async () => {
    const k = "t" + Math.random();
    const r = [];
    for (let i = 0; i < 3; i++) r.push((await rateLimit(k, 2, 1000)).ok);
    expect(r).toEqual([true, true, false]);
  });
  it("validates channel ids", () => {
    expect(isChannelId("demo")).toBe(true);
    expect(isChannelId("UC" + "a".repeat(22))).toBe(true);
    expect(isChannelId("../x")).toBe(false);
    expect(isChannelId("UCshort")).toBe(false);
  });
  it("rejects cross-site POSTs", () => {
    expect(sameOrigin(new Headers({ origin: "https://evil.example", host: "app.example" }))).toBe(false);
    expect(sameOrigin(new Headers({ origin: "https://app.example", host: "app.example" }))).toBe(true);
    expect(sameOrigin(new Headers({ host: "app.example" }))).toBe(true);
  });
});

describe("crypto + session", () => {
  process.env.SESSION_SECRET = "test-secret-for-vitest";
  it("round-trips and rejects tampering", () => {
    const t = seal({ a: 1 });
    expect(open<{ a: number }>(t)).toEqual({ a: 1 });
    expect(open(t.slice(0, -2) + "AA")).toBeNull();
    expect(open("garbage")).toBeNull();
    expect(open(undefined)).toBeNull();
  });
  const ch = (i: number, at = i): SavedChannel => ({ id: "UC" + String(i).repeat(22), title: "T".repeat(80), rt: "r".repeat(300) + i, email: "someone@example.com", handle: "@h", at });
  const jar = () => {
    const set = new Map<string, string>(); const deleted: string[] = [];
    return { set, deleted, res: { set: (n: string, v: string) => set.set(n, v), delete: (n: string) => deleted.push(n) } };
  };
  it("stores each channel in its own cookie, each well under the browser limit", () => {
    for (let i = 0; i < 6; i++) expect(sealChannel(ch(i))!.length).toBeLessThan(3000);
    expect(sealChannel({ ...ch(1), rt: "r".repeat(2048), title: "T".repeat(200), email: "e".repeat(300) })!.length).toBeLessThan(3800);
  });
  it("two concurrent sign-ins never overwrite each other", () => {
    // Both callbacks saw the same starting cookies and each writes only its own channel.
    const a = jar(), b = jar();
    writeSession(a.res, [], [ch(1)], new Set([ch(1).id]));
    writeSession(b.res, [], [ch(2)], new Set([ch(2).id]));
    const browser = [...a.set, ...b.set].map(([name, value]) => ({ name, value }));
    expect(readSession(browser).channels.map((c) => c.id)).toEqual([ch(2).id, ch(1).id]);
    expect([...a.deleted, ...b.deleted]).toEqual([]);
  });
  it("caps channels, newest first, and deletes the overflow cookie", () => {
    const all = Array.from({ length: 7 }, (_, i) => ch(i + 1));
    const present = all.map((c) => channelCookie(c.id));
    const j = jar();
    const kept = writeSession(j.res, present, all);
    expect(kept).toHaveLength(6);
    expect(kept[0].id).toBe(ch(7).id);
    expect(j.deleted).toEqual([channelCookie(ch(1).id)]);
  });
  it("migrates the legacy single-cookie session", () => {
    const legacy = { name: "hs_session", value: seal({ v: 1, channels: [ch(3, 0), ch(4, 0)] }) };
    expect(readSession([legacy]).channels.map((c) => c.id)).toEqual([ch(3).id, ch(4).id]);
    const j = jar();
    writeSession(j.res, ["hs_session"], readSession([legacy]).channels);
    expect([...j.set.keys()].sort()).toEqual([channelCookie(ch(3).id), channelCookie(ch(4).id)].sort());
    expect(j.deleted).toEqual(["hs_session"]);
  });
  it("ignores a channel cookie whose name doesn't match its contents", () => {
    expect(readSession([{ name: channelCookie(ch(5).id), value: seal(ch(6)) }]).channels).toEqual([]);
  });
});

describe("youtube + net", () => {
  it("parses ISO durations", () => {
    expect(parseDuration("PT45S")).toBe(45);
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("P0D")).toBe(0);
    expect(parseDuration("")).toBe(0);
  });
  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => (++calls < 3 ? new Response("", { status: 503 }) : new Response("ok"))) as typeof fetch;
    try {
      const r = await fetchRetry("https://x.test", {}, { retries: 3 });
      expect(await r.text()).toBe("ok");
      expect(calls).toBe(3);
    } finally { globalThis.fetch = real; }
  });
  it("coalesces concurrent work", async () => {
    let runs = 0;
    const f = () => once("k", async () => { runs++; await new Promise((r) => setTimeout(r, 10)); return 7; });
    expect(await Promise.all([f(), f(), f()])).toEqual([7, 7, 7]);
    expect(runs).toBe(1);
  });
});

describe("experiment cookie validation", () => {
  const good = { featureKey: "tag_set", control: { name: "A", bucket: "x" }, challenger: { name: "B", bucket: null }, startedAt: Date.now() - 1000, perArm: 40 };
  it("accepts a well-formed record", () => expect(sanitizeExperiment(good)).not.toBeNull());
  it("rejects junk", () => {
    expect(sanitizeExperiment({ ...good, featureKey: "../../x" })).toBeNull();
    expect(sanitizeExperiment({ ...good, perArm: 1e9 })).toBeNull();
    expect(sanitizeExperiment({ ...good, startedAt: 5 })).toBeNull();
    expect(sanitizeExperiment("x")).toBeNull();
  });
});

describe("degenerate catalogs never crash", () => {
  const mk = (n: number, f: (i: number) => Partial<(typeof demoVideos)[number]> = () => ({})) =>
    Array.from({ length: n }, (_, i) => ({ id: "v" + i, title: "Title " + i, publishedAt: Date.parse("2025-01-01") + i * 86400000, durationS: 30, views: 100, likes: 1, comments: 0, tags: [], descLen: 10, cta: false, privacy: "public", ...f(i) }));
  it.each([[0], [1], [10], [80]])("%i identical videos", (n) => {
    const { out } = analyze(mk(n), { tz: "UTC", metric: "views", now: Date.parse("2026-01-01") });
    expect(out.summary.total).toBe(n);
    expect(out.findings).toHaveLength(0);
    for (const t of out.timeline) expect(Number.isFinite(t.smooth)).toBe(true);
  });
  it("ignores private and unlisted videos", () => {
    const { out } = analyze(mk(120, (i) => ({ privacy: i % 2 ? "private" : "public" })), { tz: "UTC", metric: "views", now: Date.parse("2026-01-01") });
    expect(out.summary.total).toBe(60);
  });
  it("handles zero views", () => {
    const { out } = analyze(mk(150, () => ({ views: 0, likes: 0 })), { tz: "UTC", metric: "likes", now: Date.parse("2026-01-01") });
    expect(out.summary.eligible).toBeGreaterThan(0);
  });
  it("falls back to UTC for an invalid time zone and to views for an unknown metric", () => {
    const { out } = analyze(mk(150), { tz: "Not/AZone", metric: "bogus" as never, now: Date.parse("2026-01-01") });
    expect(out.tz).toBe("UTC");
    expect(out.metric).toBe("views");
  });
  it("drops malformed videos instead of poisoning the statistics", () => {
    const vids = mk(120, (i) => (i % 10 === 0 ? { views: NaN } : i % 10 === 1 ? { publishedAt: NaN } : {}));
    const { out } = analyze(vids as never, { tz: "UTC", metric: "views", now: Date.parse("2026-01-01") });
    expect(out.summary.total).toBe(96);
    for (const t of out.timeline) expect(Number.isFinite(t.pct)).toBe(true);
  });
});

import { permutationTest } from "../src/lib/analytics/stats";
import { sanitizeChannel, sanitizeLegacySession } from "../src/lib/session";
import { toVideo } from "../src/lib/youtube";
import { resetBreakers, UpstreamError } from "../src/lib/net";
import { log } from "../src/lib/log";
import { isHost } from "../src/lib/guard";

describe("hardening", () => {
  it("permutation test is symmetric in its arguments", () => {
    const a = Array.from({ length: 30 }, (_, i) => i + 10);
    const b = Array.from({ length: 300 }, (_, i) => i % 50);
    expect(permutationTest(a, b, 2000, 1)).toBe(permutationTest(b, a, 2000, 1));
  });

  it("opens a session sealed with the previous secret after rotation", () => {
    process.env.SESSION_SECRET = "old-secret-old-secret-old-secret";
    const t = seal({ v: 1 });
    process.env.SESSION_SECRET = "new-secret-new-secret-new-secret";
    expect(open(t)).toBeNull();
    process.env.SESSION_SECRET_PREVIOUS = "old-secret-old-secret-old-secret";
    expect(open(t)).toEqual({ v: 1 });
    delete process.env.SESSION_SECRET_PREVIOUS;
    process.env.SESSION_SECRET = "test-secret-for-vitest";
  });

  it("sanitises a decrypted session", () => {
    const ok = { id: "UC" + "x".repeat(22), rt: "r", title: "T" };
    expect(sanitizeChannel(null)).toBeNull();
    expect(sanitizeLegacySession({ v: 2, channels: [ok] })).toEqual([]);
    const s = sanitizeLegacySession({ v: 1, channels: [ok, { id: "demo", rt: "r" }, { id: "../x", rt: "r" }, { id: "UC" + "y".repeat(22) }, "junk", { ...ok, id: "UC" + "z".repeat(22), thumb: "javascript:alert(1)" }] });
    expect(s.map((c) => c.id)).toEqual([ok.id, "UC" + "z".repeat(22)]);
    expect(s[1].thumb).toBeUndefined();
  });

  it("parses incomplete YouTube items defensively", () => {
    expect(toVideo({} as never)).toBeNull();
    expect(toVideo({ id: "abcdefghijk", snippet: { publishedAt: "not a date" } })).toBeNull();
    const v = toVideo({ id: "abcdefghijk", snippet: { publishedAt: "2025-01-01T00:00:00Z", tags: ["a", 5, null] as never }, statistics: { viewCount: "-4", likeCount: "x" } })!;
    expect(v.views).toBe(0);
    expect(v.likes).toBe(0);
    expect(v.tags).toEqual(["a"]);
    expect(v.title).toBe("");
    expect(v.durationS).toBe(0);
  });

  it("opens a circuit after repeated upstream failures", async () => {
    resetBreakers();
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { calls++; return new Response("", { status: 503 }); }) as typeof fetch;
    try {
      for (let i = 0; i < 5; i++) await fetchRetry("https://x.test", {}, { retries: 0, breaker: "t" });
      const before = calls;
      await expect(fetchRetry("https://x.test", {}, { retries: 0, breaker: "t" })).rejects.toBeInstanceOf(UpstreamError);
      expect(calls).toBe(before);
    } finally { globalThis.fetch = real; resetBreakers(); }
  });

  it("once() turns a synchronous throw into a rejection", async () => {
    await expect(once("sync-throw", () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("redacts secrets in logs and never throws on odd fields", () => {
    const lines: string[] = [];
    const real = console.log;
    console.log = (l: string) => lines.push(l);
    try {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      log("info", "x", { refresh_token: "abc", email: "a@b.c", n: 1 });
      log("info", "y", { circular });
    } finally { console.log = real; }
    expect(lines[0]).not.toContain("abc");
    expect(lines[0]).not.toContain("a@b.c");
    expect(JSON.parse(lines[1]).msg).toBe("y");
  });

  it("validates hosts and fetch metadata", () => {
    expect(isHost("app.example.com:3000")).toBe(true);
    expect(isHost("evil.com/path")).toBe(false);
    expect(isHost("a b")).toBe(false);
    expect(sameOrigin(new Headers({ "sec-fetch-site": "cross-site", host: "app.example" }))).toBe(false);
    expect(sameOrigin(new Headers({ origin: "https://app.example", host: "bad host" }))).toBe(false);
  });

  it("neutralises formulas hidden behind whitespace and blanks non-finite numbers", () => {
    expect(csvCell("  =1+1")).toBe("'  =1+1");
    expect(csvCell(NaN)).toBe("");
  });

  it("accepts long tag-set arms but rejects a missing control bucket", () => {
    const good = { featureKey: "tag_set", control: { name: "Keep", bucket: "t".repeat(500) }, challenger: { name: "B", bucket: null }, startedAt: Date.now() - 1000, perArm: 40 };
    expect(sanitizeExperiment(good)).not.toBeNull();
    expect(sanitizeExperiment({ ...good, control: { name: "Keep", bucket: null } })).toBeNull();
  });

  it("reads an experiment without counting zero-duration uploads", () => {
    const now = Date.parse("2026-08-16T00:00:00Z");
    const vids = demoVideos.map((v, i) => (i % 2 ? { ...v, durationS: 0 } : v));
    const b = analyze(vids, { tz: DEMO_TZ, metric: "views", now });
    const exp = { featureKey: "publish_hour", control: { name: "01:00", bucket: "01:00" }, challenger: { name: "rest", bucket: null }, startedAt: Date.parse("2025-07-01"), perArm: 40 };
    const r = readExperiment(b, exp, now);
    const zero = b.scored.filter((s) => s.video.durationS === 0 && s.video.publishedAt >= exp.startedAt).length;
    expect(zero).toBeGreaterThan(0);
    expect(r.nA + r.nB).toBeLessThanOrEqual(b.scored.length - zero);
  });
});

import { resetStore } from "../src/lib/store";

describe("shared store", () => {
  const withStore = async (handler: (body: unknown[][]) => Response | Promise<Response>, fn: () => Promise<void>) => {
    const real = globalThis.fetch;
    process.env.UPSTASH_REDIS_REST_URL = "https://kv.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    resetStore(); resetBreakers();
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => handler(JSON.parse(String(init?.body)))) as typeof fetch;
    try { await fn(); } finally {
      globalThis.fetch = real;
      delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
      resetStore(); resetBreakers();
    }
  };

  it("counts across instances and never sends the raw key", async () => {
    const counters = new Map<string, number>();
    const sent: string[] = [];
    await withStore((cmds) => {
      sent.push(JSON.stringify(cmds));
      const k = String(cmds[0][1]);
      counters.set(k, (counters.get(k) ?? 0) + 1);
      return Response.json([{ result: counters.get(k) }, { result: 1 }, { result: 60000 }]);
    }, async () => {
      const r = [];
      for (let i = 0; i < 3; i++) r.push((await rateLimit("auth:203.0.113.9", 2, 60_000)).ok);
      expect(r).toEqual([true, true, false]);
      expect(sent.join()).not.toContain("203.0.113.9");
    });
  });

  it("falls back to per-instance limits when the store is down", async () => {
    let calls = 0;
    await withStore(() => { calls++; return new Response("", { status: 500 }); }, async () => {
      const r = [];
      for (let i = 0; i < 3; i++) r.push((await rateLimit("down:" + Math.random(), 5, 60_000)).ok);
      expect(r).toEqual([true, true, true]);
      expect(calls).toBe(1); // marked down after the first failure, then skipped
    });
  });

  it("shares an open circuit with other instances", async () => {
    await withStore((cmds) => Response.json(cmds.map((c) => ({ result: c[0] === "EXISTS" ? 1 : "OK" }))), async () => {
      await expect(fetchRetry("https://x.test", {}, { retries: 0, breaker: "yt" })).rejects.toBeInstanceOf(UpstreamError);
    });
  });
});
