import { Check, LogOut, Plus } from "lucide-react";
import type { Metadata } from "next";
import { ThemeSetting } from "@/components/theme";
import { ActionForm, ConfirmButton, ICON, Picker, SegmentedField } from "@/components/ui";
import { savePrefs } from "@/lib/actions";
import { authConfigured } from "@/lib/env";
import { getPrefs } from "@/lib/prefs";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings({ params, searchParams }: { params: Promise<{ channel: string }>; searchParams: Promise<{ disconnected?: string }> }) {
  const { channel } = await params;
  const { disconnected } = await searchParams;
  const [prefs, session] = [await getPrefs(), await getSession()];
  const ready = authConfigured();
  const zones = ["UTC", ...(Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone")];
  const demo = channel === "demo";

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <h1>Settings</h1>
      {disconnected && <div className="notice" role="status"><Check {...ICON} /><div className="grow">Channel disconnected and its Google access revoked.</div></div>}

      <section className="sec">
        <header><h2>Channels</h2><p>Each connection is read-only.</p></header>
        <div className="card pad-0">
          {session.channels.map((c) => (
            <div key={c.id} className="form-row" style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                {c.thumb ? <img className="avatar" style={{ width: 32, height: 32 }} src={c.thumb} alt="" referrerPolicy="no-referrer" /> : <div className="avatar" style={{ width: 32, height: 32 }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="form-row-label">{c.title}</div>
                  <div className="form-row-hint" style={{ marginTop: 0 }}>{c.email ?? c.handle ?? c.id}</div>
                </div>
              </div>
              <ConfirmButton
                label="Disconnect" title={`Disconnect ${c.title}?`} confirmLabel="Disconnect" formAction="/api/auth/logout" fields={{ channel: c.id }}
                text="Hindsight will forget this channel and revoke its access at Google. You can reconnect any time."
              />
            </div>
          ))}
          {!session.channels.length && <div className="form-row" style={{ padding: "14px 18px", borderTop: 0 }}><span className="faint">{demo ? "You’re viewing the sample channel. Nothing is connected." : "No channels connected."}</span></div>}
          {ready && (
            <div className="form-row" style={{ padding: "12px 18px" }}>
              <div><div className="form-row-label">Add a channel</div><div className="form-row-hint">Pick another Google account, or another brand channel you manage. Each one is analysed separately.</div></div>
              <a className="btn btn-ghost btn-sm" href="/api/auth/google"><Plus {...ICON} size={14} /> Add channel</a>
            </div>
          )}
        </div>
      </section>

      <section className="sec">
        <header><h2>Analysis</h2></header>
        <ActionForm action={savePrefs} success="Settings saved. Re-analysing…" label="Save and re-analyse" btnClass="btn btn-primary" className="card pad-0" footerClass="form-foot">
          <div className="form-row" style={{ padding: "14px 18px", borderTop: 0 }}>
            <div><div className="form-row-label">Time zone</div><div className="form-row-hint">Publish hours and weekdays are bucketed in this zone. {demo && "The sample channel always uses UTC+5:30."}</div></div>
            <div className="form-row-control"><Picker name="tz" value={prefs.tz} options={zones} placeholder="Search time zones" /></div>
          </div>
          <div className="form-row" style={{ padding: "14px 18px" }}>
            <div><div className="form-row-label">What counts as “performing”</div><div className="form-row-hint">Views measures reach. Like and comment rates measure how strongly videos landed with the people who saw them.</div></div>
            <div className="form-row-control">
              <SegmentedField name="metric" label="Metric" initial={prefs.metric} options={[
                { value: "views", label: "Views" }, { value: "likes", label: "Likes" }, { value: "comments", label: "Comments" }, { value: "engagement", label: "Both" },
              ]} />
            </div>
          </div>
        </ActionForm>
      </section>

      <section className="sec">
        <header><h2>Appearance</h2></header>
        <div className="card pad-0">
          <div className="form-row" style={{ padding: "14px 18px", borderTop: 0 }}>
            <div><div className="form-row-label">Theme</div><div className="form-row-hint">System follows your device.</div></div>
            <ThemeSetting />
          </div>
        </div>
      </section>

      {session.channels.length > 0 && (
        <section className="sec">
          <header><h2>Your data</h2></header>
          <div className="card">
            <p style={{ lineHeight: 1.55, color: "var(--ink-2)" }}>
              Hindsight has no database. Your grant lives in an encrypted cookie in this browser, and video data is held in memory for about 20 minutes. Signing out removes the cookie and revokes access at Google for every connected channel.
            </p>
            <div style={{ marginTop: 14 }}>
              <ConfirmButton
                label="Sign out everywhere" title="Disconnect all channels?" confirmLabel="Disconnect all" formAction="/api/auth/logout"
                text="This revokes Hindsight’s access to every channel connected in this browser and clears the session." className="btn btn-ghost"
              ><LogOut {...ICON} /> Disconnect all channels</ConfirmButton>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
