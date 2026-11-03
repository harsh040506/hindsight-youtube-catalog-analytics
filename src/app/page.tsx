import { ArrowRight, Eye, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { GoogleMark, Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme";
import { ICON } from "@/components/ui";
import { authConfigured } from "@/lib/env";
import { getSession } from "@/lib/session";

const ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled. Nothing was connected.",
  "not-configured": "Sign-in isn’t switched on for this site yet. You can still explore the sample channel.",
  busy: "Too many sign-in attempts. Please wait a minute and try again.",
  "not-connected": "That channel isn’t connected in this browser. Sign in to connect it.",
  scope: "YouTube read-only access wasn’t granted. Hindsight needs it to read your video list and public stats.",
  "no-channel": "That Google account doesn’t have a YouTube channel. Pick the account or brand channel that owns your videos.",
  "no-refresh": "Google didn’t return a long-lived grant. Remove Hindsight at myaccount.google.com/permissions and connect again.",
  state: "That sign-in link expired. Please try again.",
  google: "Google couldn’t complete the sign-in. Please try again.",
  quota: "YouTube’s daily API quota for this site is used up. Please try again tomorrow, or explore the sample channel meanwhile.",
  unavailable: "Google or YouTube didn’t respond just now. Please try again in a minute.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; signedout?: string }> }) {
  const { error, signedout } = await searchParams;
  const ready = authConfigured();
  const session = await getSession();
  const first = session.channels[0];

  return (
    <div className="app">
      <header className="toolbar" role="toolbar" aria-label="Hindsight">
        <Link href="/" className="brand"><Logo /> <span>Hindsight</span></Link>
        <div className="tb-spacer" />
        <ThemeMenu />
        <Link href="/privacy" className="tb-btn has-label tb-extra"><span>Privacy</span></Link>
        <Link href="/dashboard/demo" className="tb-btn has-label"><span>Demo</span></Link>
        {first ? (
          <Link href={`/dashboard/${first.id}`} className="tb-btn tb-export has-label"><span>Open dashboard</span></Link>
        ) : ready ? (
          <a href="/api/auth/google" className="tb-btn tb-export has-label"><span>Sign in</span></a>
        ) : null}
      </header>

      <main className="scroller">
        <div className="page is-wide">
          {signedout && (
            <div className="notice" role="status"><ShieldCheck {...ICON} /><div className="grow">You’re signed out and Hindsight’s access to your channels has been revoked.</div></div>
          )}
          {error && (
            <div className="notice warn" role="alert">
              <TriangleAlert {...ICON} /><div className="grow">{(Object.hasOwn(ERRORS, error) && ERRORS[error]) || "Something went wrong. Please try again."}</div>
            </div>
          )}

          <section className="hero">
            <h1>Your channel already ran the experiment.</h1>
            <p className="lede">
              Every video you’ve published is a test of a title, a length, a posting time. Hindsight reads your back catalog,
              works out which of those choices actually moved the numbers, and designs the experiment that settles the next question.
            </p>
            <div className="cta">
              {first ? (
                <Link href={`/dashboard/${first.id}`} className="btn btn-primary btn-lg">Open your dashboard <ArrowRight {...ICON} /></Link>
              ) : ready ? (
                <a href="/api/auth/google" className="btn btn-primary btn-lg"><GoogleMark /> Connect with Google</a>
              ) : null}
              <Link href="/dashboard/demo" className="btn btn-ghost btn-lg">Explore a sample channel</Link>
            </div>
            <p className="faint small" style={{ marginTop: 14 }}>
              Read-only access · no database · works with every channel you own, including brand channels
            </p>
            {ready && !first && (
              <p className="faint small" style={{ marginTop: 6 }}>
                Hindsight uses YouTube API Services. By connecting, you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>; see also our <Link href="/privacy">privacy policy</Link>.
              </p>
            )}
            {!ready && (
              <div className="notice" style={{ marginTop: 22 }}>
                <ShieldCheck {...ICON} />
                <div className="grow">Sign-in is being set up. Explore the sample channel in the meantime. <Link href="/setup">Site owner? Finish setup →</Link></div>
              </div>
            )}
          </section>

          <section className="sec">
            <header><h2>What it found on a real channel</h2><p>949 videos, thirteen months. Both results survive correction for multiple testing and replicate on both halves of the catalog.</p></header>
            <div className="proof">
              <div className="card">
                <div className="stat"><span className="k">Publishing at 01:00</span><span className="v bad">−13.9 points</span><span className="s">median 70 views · 83 videos</span></div>
              </div>
              <div className="card">
                <div className="stat"><span className="k">Publishing at 12:00</span><span className="v good">+13.5 points</span><span className="s">median 323 views · 58 videos</span></div>
              </div>
            </div>
            <p className="lede" style={{ marginTop: 16 }}>
              That’s a 4.6× difference in median views from the hour of day alone, on a channel that had published for a year without noticing.
              It also found that every one of the 845 analysed videos used the same five tags, a lever that had never once been varied.
              <Link href="/dashboard/demo" style={{ marginLeft: 6 }}>See it live →</Link>
            </p>
          </section>

          <section className="sec">
            <header><h2>Why comparing videos is harder than it looks</h2></header>
            <div className="grid g3">
              <div className="card feat"><h3>Views mostly measure age</h3><p>A video from last July has had a year on a smaller channel. Hindsight scores each video as a percentile against the 50 videos published nearest to it, so size, season and age cancel out.</p></div>
              <div className="card feat"><h3>Forty tests, two false alarms</h3><p>Every p-value in a run is corrected together (Benjamini–Hochberg), and each finding is re-tested on the older and newer halves of your catalog.</p></div>
              <div className="card feat"><h3>“No finding” has three meanings</h3><p>Measured and null, never varied, or too lopsided to measure. Hindsight keeps them apart and treats the untested levers as the most valuable output.</p></div>
            </div>
          </section>

          <section className="sec">
            <header><h2>How it works</h2></header>
            <ol className="steps">
              <li><div><b>Connect.</b> <span className="faint">Sign in with Google and pick a channel. Repeat for each channel you run.</span></div></li>
              <li><div><b>Analyse.</b> <span className="faint">Hindsight reads your video list and public stats once and scores about 30 choices: length, tags, title, hour, weekday.</span></div></li>
              <li><div><b>Act.</b> <span className="faint">Get the findings that are real, the levers you’ve never tried, and a power-sized experiment with the exact arm for your next upload.</span></div></li>
            </ol>
          </section>

          <section className="sec">
            <div className="grid g3">
              <div className="card flat feat"><h3><Eye size={15} strokeWidth={1.5} style={{ verticalAlign: -2 }} /> Read-only</h3><p>Only the <span className="mono">youtube.readonly</span> scope. Hindsight cannot upload, edit or delete anything.</p></div>
              <div className="card flat feat"><h3><Lock size={15} strokeWidth={1.5} style={{ verticalAlign: -2 }} /> No database</h3><p>Nothing about your channel is stored on a server. Your grant lives in an encrypted cookie in your browser.</p></div>
              <div className="card flat feat"><h3><ShieldCheck size={15} strokeWidth={1.5} style={{ verticalAlign: -2 }} /> Yours to revoke</h3><p>Disconnect any channel in Settings, or at myaccount.google.com/permissions. It takes effect immediately.</p></div>
            </div>
          </section>

          <footer className="foot">
            <span>Hindsight</span>
            <Link href="/privacy">Privacy</Link>
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a>
            <Link href="/dashboard/demo">Sample channel</Link>
            <a href="https://github.com/harsh040506/potential-octo-fishstick" target="_blank" rel="noreferrer">Source</a>
          </footer>
        </div>
      </main>
    </div>
  );
}
