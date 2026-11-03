import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="app">
      <header className="toolbar">
        <Link href="/" className="brand"><Logo /> <span>Hindsight</span></Link>
        <div className="tb-spacer" />
        <ThemeMenu />
      </header>
      <main className="scroller">
        <div className="page">
          <h1>Privacy</h1>
          <p className="faint" style={{ marginTop: 6 }}>Plain language. Last updated November 2026.</p>
          <div className="stack" style={{ gap: 18, marginTop: 28, lineHeight: 1.6 }}>
            <section><h2>What Hindsight accesses</h2><p>When you sign in with Google, Hindsight asks for your email address and <b>read-only</b> access to your YouTube account (<span className="mono">youtube.readonly</span>). It uses that to read your channel’s name and statistics and the list of videos you’ve uploaded: titles, descriptions, tags, durations, publish times and public view/like/comment counts. It cannot upload, edit, or delete anything, and it does not read private analytics, comments’ text, or your viewers’ data.</p></section>
            <section><h2>What Hindsight stores</h2><p>There is no database. Your Google grant (a refresh token) is kept in an encrypted, HTTP-only cookie in your own browser, so you can come back without signing in again. Your preferences (time zone, metric) and any experiment you start tracking are kept in browser cookies too. Video data is held in server memory for up to about 20 minutes to make navigation fast, then discarded. If the site owner enables shared rate limiting, the only thing stored is a short-lived request counter under a one-way hash of your IP address, which expires within minutes. Hindsight does not sell, share, or use your data for advertising, or to train models.</p></section>
            <section><h2>Using Google data</h2><p>Hindsight’s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use">Google API Services User Data Policy</a>, including the Limited Use requirements.</p></section>
            <section><h2>YouTube API Services</h2><p>Hindsight uses YouTube API Services to read your channel. By connecting a channel you agree to the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, and Google’s handling of your data is covered by the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p></section>
            <section><h2>Revoking access</h2><p>Open Settings and choose Disconnect on a channel (this also revokes the grant at Google), or remove Hindsight at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>. Clearing your browser cookies also signs you out.</p></section>
            <section><h2>The sample channel</h2><p>The bundled demo is an anonymised snapshot of a real catalog. Video ids, channel identity and titles are synthetic.</p></section>
          </div>
        </div>
      </main>
    </div>
  );
}
