export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Dashboard() {
  const s = await getSession();
  redirect(`/dashboard/${s.channels[0]?.id ?? "demo"}`);
}
