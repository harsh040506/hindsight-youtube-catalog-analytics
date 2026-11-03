import { redirect } from "next/navigation";
import { loadChannel } from "@/lib/data";
import { getPrefs } from "@/lib/prefs";
import { authConfigured } from "@/lib/env";
import { getSession } from "@/lib/session";

export async function getData(channelId: string) {
  const prefs = await getPrefs();
  const r = await loadChannel(channelId, prefs);
  if (!r.ok && r.kind === "not-found") redirect("/");
  return { r, prefs, signInReady: authConfigured(), session: await getSession() };
}
