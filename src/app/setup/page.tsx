import { Check, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CopyField } from "@/components/copy";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme";
import { configWarnings } from "@/lib/env";
import { redirectUri } from "@/lib/google";
import { sharedStoreConfigured } from "@/lib/store";

export const metadata: Metadata = { title: "Owner setup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"] as const;

export default async function Setup() {
  const h = await headers();
  const uri = redirectUri(h, "https://your-app.vercel.app");
  const origin = new URL(uri).origin;
  const state = VARS.map((k) => ({ k, set: Boolean(process.env[k]?.trim()) }));
  const warnings = configWarnings();
  const done = state.every((s) => s.set);

  return (
    <div className="app">
      <header className="toolbar">
        <Link href="/" className="brand"><Logo /> <span>Hindsight</span></Link>
        <div className="tb-spacer" /><ThemeMenu />
      </header>
      <main className="scroller"><div className="page">
        <h1>Owner setup</h1>
        <p className="lede" style={{ marginTop: 8 }}>
          One-time, about ten minutes, and only for whoever deploys this site. Visitors never see any of this: they click <b>Sign in with Google</b> and that’s it.
        </p>

        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 500, marginBottom: 10 }}>{done ? "Everything is configured. Sign-in is live." : "Environment variables"}</div>
          <div className="stack" style={{ gap: 6 }}>
            {state.map((s) => (
              <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {s.set ? <Check size={15} strokeWidth={1.75} style={{ color: "var(--success-text)" }} /> : <CircleDashed size={15} strokeWidth={1.5} style={{ color: "var(--text-3)" }} />}
                <span className="mono small">{s.k}</span>
                <span className="faint small">{s.set ? "set" : "missing"}</span>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <ul className="faint small" style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--warning-text)" }}>
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>

        <ol className="steps" style={{ marginTop: 28 }}>
          <li><div><b>Create a Google Cloud project</b> and enable the <b>YouTube Data API v3</b> (APIs &amp; Services → Library).
            <div style={{ marginTop: 6 }}><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Open the API page →</a></div></div></li>
          <li><div><b>Configure the OAuth consent screen</b> as External. Add the scope <span className="mono small">youtube.readonly</span> and use this as the privacy policy link:
            <div style={{ marginTop: 8 }}><CopyField value={`${origin}/privacy`} label="Privacy policy URL" /></div></div></li>
          <li><div><b>Create an OAuth client ID</b> (type: Web application) with exactly this <b>Authorized redirect URI</b>:
            <div style={{ marginTop: 8 }}><CopyField value={uri} label="Authorized redirect URI" /></div></div></li>
          <li><div><b>Add the three variables</b> in Vercel → Project → Settings → Environment Variables, then redeploy. For <span className="mono small">SESSION_SECRET</span> paste any long random string:
            <div style={{ marginTop: 8 }}><CopyField value="openssl rand -base64 32" label="Generate a secret" /></div></div></li>
          <li><div><b>Let people in.</b> While the consent screen is in <i>Testing</i>, only people you add as test users can sign in. Press <b>Publish app</b> and submit for verification so anyone can. Until Google approves it, visitors see an “unverified app” screen they can click through.</div></li>
        </ol>
        <p className="faint small" style={{ marginTop: 28, lineHeight: 1.6 }}>
          Optional: connect an Upstash Redis or Vercel KV store (<span className="mono">UPSTASH_REDIS_REST_URL</span> and <span className="mono">UPSTASH_REDIS_REST_TOKEN</span>) so rate limits hold across all server instances.
          Rate limits are currently <b>{sharedStoreConfigured() ? "shared" : "per instance"}</b>.
        </p>
        <p className="faint small" style={{ marginTop: 8 }}>Health check: <a href="/api/health">/api/health</a></p>
      </div></main>
    </div>
  );
}
