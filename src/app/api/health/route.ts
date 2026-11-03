import { NextResponse } from "next/server";
import { configWarnings, missingEnv } from "@/lib/env";
import { sharedStoreConfigured } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Names of missing variables and config hints only; never values. */
export function GET() {
  const missing = missingEnv();
  return NextResponse.json(
    {
      ok: missing.length === 0,
      signIn: missing.length === 0 ? "ready" : "not configured",
      missing,
      limits: sharedStoreConfigured() ? "shared" : "per-instance",
      warnings: configWarnings(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
