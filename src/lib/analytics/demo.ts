import raw from "../../../data/demo.json";
import type { ChannelInfo, Video } from "./types";

interface RawVideo { id: string; t: string; p: string; d: number; v: number; l: number; c: number; g: string[]; dl: number; cta: number; pv: string }

export const DEMO_ID = "demo";
/** The bundled catalog's own channel runs on UTC+5:30, which is where its hour-of-day findings live. */
export const DEMO_TZ = "Asia/Kolkata";

export const demoChannel: ChannelInfo = {
  id: DEMO_ID,
  title: "Demo Philosophy Channel",
  subscribers: raw.channel.subs,
  views: raw.channel.views,
  videoCount: raw.channel.videos,
};

export const demoVideos: Video[] = (raw.videos as RawVideo[]).map((v) => ({
  id: v.id, title: v.t, publishedAt: Date.parse(v.p), durationS: v.d, views: v.v, likes: v.l,
  comments: v.c, tags: v.g, descLen: v.dl, cta: v.cta === 1, privacy: v.pv,
}));
