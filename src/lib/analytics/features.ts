import type { Video } from "./types";
import { localParts } from "./time";

export interface Feature {
  key: string;
  label: string;
  lever: string;
  group: "metadata" | "title" | "timing";
  description: string;
  extract: (v: Video) => string | null;
  /** feature keys this one makes redundant */
  supersedes?: string[];
}

const EMOJI = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu;

const STOP = new Set(
  `a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself`.split(/\s+/),
);

export const wordsIn = (t: string): string[] => (t || "").toLowerCase().match(/[a-z']+/g) ?? [];
export const contentWords = (t: string): string[] => wordsIn(t).filter((w) => !STOP.has(w) && w.length > 2);
export const emojisIn = (t: string): string[] => (t || "").match(EMOJI) ?? [];

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Turn a numeric attribute into labelled buckets. If a handful of exact values cover most of the
 * catalog (a channel that always renders 9s or 15s videos) use them; otherwise use quartiles.
 */
export function adaptiveBuckets(values: number[], maxExact = 8, exactCoverage = 0.8): (v: number) => string | null {
  if (!values.length) return () => null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxExact);
  const coverage = common.reduce((s, [, c]) => s + c, 0) / values.length;
  if (coverage >= exactCoverage && counts.size > 1) {
    const keep = new Set(common.map(([v]) => v));
    return (v) => (keep.has(v) ? fmtNum(v) : null);
  }
  const s = [...values].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(s.length * f))];
  const q1 = q(0.25);
  const q2 = q(0.5);
  const q3 = q(0.75);
  if (q1 === q3) return (v) => (v === q2 ? fmtNum(v) : null);
  return (v) => {
    if (v <= q1) return `≤ ${fmtNum(q1)}`;
    if (v <= q2) return `${fmtNum(q1)}–${fmtNum(q2)}`;
    if (v <= q3) return `${fmtNum(q2)}–${fmtNum(q3)}`;
    return `> ${fmtNum(q3)}`;
  };
}

const suffix = (label: string | null, s: string) => (label === null ? null : label + s);

const sentenceForm = (t: string) => {
  const x = (t || "").trim();
  return x.endsWith("?") ? "question" : x.endsWith("!") ? "exclamation" : "statement";
};

const clauseBucket = (t: string) => {
  const c = ((t || "").match(/,/g) ?? []).length;
  return c === 0 ? "single clause" : c === 1 ? "two clauses" : "three or more clauses";
};

export function buildFeatures(videos: Video[], tz: string, keywordCount = 12, minKeywordDocs = 25): Feature[] {
  const out: Feature[] = [];

  const dur = adaptiveBuckets(videos.map((v) => v.durationS || 0));
  out.push({
    key: "duration", label: "Video length", group: "metadata",
    lever: "Publish at a different length",
    description: "Runtime in seconds, bucketed to the lengths this channel actually uses.",
    extract: (v) => (v.durationS ? suffix(dur(v.durationS), "s") : null),
  });

  const desc = adaptiveBuckets(videos.map((v) => v.descLen));
  out.push({
    key: "description_length", label: "Description length", group: "metadata",
    lever: "Write a longer or shorter description",
    description: "Total characters in the description, including hashtags.",
    extract: (v) => suffix(desc(v.descLen), " chars"),
  });

  const tagN = adaptiveBuckets(videos.map((v) => v.tags.length));
  out.push({
    key: "tag_count", label: "Number of tags", group: "metadata",
    lever: "Add or remove tags",
    description: "How many tags were attached at upload.",
    extract: (v) => suffix(tagN(v.tags.length), " tags"),
  });

  out.push({
    key: "tag_set", label: "Tag set used", group: "metadata",
    lever: "Use a different set of tags",
    description: "The exact combination of tags, treated as a single choice.",
    supersedes: ["tag_count"],
    extract: (v) => [...v.tags].sort().slice(0, 5).join(", ") || "(none)",
  });

  out.push({
    key: "description_cta", label: "Call to action in description", group: "metadata",
    lever: "Include or drop the comment/share prompt",
    description: "Whether the description asks viewers to comment, share, or follow.",
    extract: (v) => (v.cta ? "has CTA" : "no CTA"),
  });

  const tw = adaptiveBuckets(videos.map((v) => wordsIn(v.title).length));
  out.push({
    key: "title_words", label: "Title word count", group: "title",
    lever: "Write a shorter or longer title",
    description: "Words in the title.",
    extract: (v) => suffix(tw(wordsIn(v.title).length), " words"),
  });

  const tc = adaptiveBuckets(videos.map((v) => v.title.length));
  out.push({
    key: "title_chars", label: "Title character count", group: "title",
    lever: "Tighten or expand the title text",
    description: "Characters in the title, which decides whether it truncates in the feed.",
    extract: (v) => suffix(tc(v.title.length), " chars"),
  });

  out.push({
    key: "title_emoji", label: "Emoji in title", group: "title",
    lever: "Add or remove emoji",
    description: "Whether the title carries any emoji at all.",
    extract: (v) => (emojisIn(v.title).length ? "with emoji" : "no emoji"),
  });

  const emojiDocs = new Map<string, number>();
  for (const v of videos) for (const e of new Set(emojisIn(v.title))) emojiDocs.set(e, (emojiDocs.get(e) ?? 0) + 1);
  const frequentEmoji = new Set([...emojiDocs].filter(([, c]) => c >= minKeywordDocs).map(([e]) => e));
  if (frequentEmoji.size > 1) {
    out.push({
      key: "title_emoji_which", label: "Which emoji", group: "title",
      lever: "Switch to a different emoji",
      description: "Which specific emoji was used, among those used often enough to compare.",
      extract: (v) => {
        const all = emojisIn(v.title);
        const found = all.filter((e: string) => frequentEmoji.has(e));
        return found[0] ?? (all.length ? null : "no frequent emoji");
      },
    });
  }

  out.push({
    key: "title_first_word", label: "Opening word", group: "title",
    lever: "Open the title on a different word",
    description: "The first word of the title, the first thing a scrolling viewer reads.",
    extract: (v) => wordsIn(v.title)[0] ?? null,
  });

  out.push({
    key: "title_person", label: "Second-person address", group: "title",
    lever: "Address the viewer as “you” or keep it impersonal",
    description: "Whether the title speaks directly to the viewer.",
    extract: (v) => (wordsIn(v.title).some((w) => ["you", "your", "yours", "yourself"].includes(w)) ? "addresses “you”" : "impersonal"),
  });

  out.push({
    key: "title_form", label: "Sentence form", group: "title",
    lever: "Phrase it as a question, an exclamation, or a statement",
    description: "Question, exclamation, or plain statement.",
    extract: (v) => sentenceForm(v.title),
  });

  out.push({
    key: "title_clauses", label: "Clause structure", group: "title",
    lever: "Use a single clause or a contrasting pair",
    description: "One clause, or several (“X, but Y” versus a flat statement).",
    extract: (v) => clauseBucket(v.title),
  });

  const docFreq = new Map<string, number>();
  for (const v of videos) for (const w of new Set(contentWords(v.title))) docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
  const keywords = [...docFreq]
    .sort((a, b) => b[1] - a[1])
    .slice(0, keywordCount * 3)
    .filter(([, c]) => c >= minKeywordDocs)
    .slice(0, keywordCount)
    .map(([w]) => w);
  for (const word of keywords) {
    out.push({
      key: `kw_${word}`, label: `Title contains “${word}”`, group: "title",
      lever: `Write about “${word}” or avoid it`,
      description: `Whether the title uses the word “${word}”.`,
      extract: (v) => (wordsIn(v.title).includes(word) ? `contains “${word}”` : `no “${word}”`),
    });
  }

  out.push({
    key: "publish_hour", label: "Publish hour", group: "timing",
    lever: "Schedule the upload for a different hour",
    description: "Hour of day the video went live, in your time zone.",
    extract: (v) => `${String(localParts(v.publishedAt, tz).hour).padStart(2, "0")}:00`,
  });

  out.push({
    key: "publish_dow", label: "Day of week", group: "timing",
    lever: "Schedule the upload for a different day",
    description: "Weekday the video went live, in your time zone.",
    extract: (v) => localParts(v.publishedAt, tz).dow,
  });

  out.push({
    key: "publish_slot", label: "Time of day", group: "timing",
    lever: "Move the upload to a different part of the day",
    description: "Coarse daypart: night, morning, afternoon or evening.",
    extract: (v) => {
      const h = localParts(v.publishedAt, tz).hour;
      return h < 6 ? "night (00–06)" : h < 12 ? "morning (06–12)" : h < 18 ? "afternoon (12–18)" : "evening (18–24)";
    },
  });

  return out;
}
