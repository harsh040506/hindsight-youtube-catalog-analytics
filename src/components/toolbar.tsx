"use client";

import { BarChart3, FlaskConical, Layers, LayoutDashboard, ListVideo, Plus, Settings, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./logo";
import { ThemeMenu } from "./theme";
import { ICON, Menu, type MenuEntry } from "./ui";

export interface ToolbarChannel { id: string; title: string; thumb?: string }

const TABS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "findings", label: "Findings", icon: Sparkles },
  { slug: "levers", label: "Levers", icon: Layers },
  { slug: "experiments", label: "Experiments", icon: FlaskConical },
  { slug: "videos", label: "Videos", icon: ListVideo },
];

export function Toolbar({ channels, current, demo, signInReady }: { channels: ToolbarChannel[]; current: ToolbarChannel; demo: boolean; signInReady: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const base = `/dashboard/${current.id}`;
  const active = TABS.find((t) => (t.slug ? path.startsWith(`${base}/${t.slug}`) : path === base)) ?? null;

  const switcher: MenuEntry[] = [
    ...(channels.length ? [{ type: "header", label: "Your channels" } as MenuEntry] : []),
    ...channels.map<MenuEntry>((c) => ({
      label: c.title, icon: c.thumb ? <img className="avatar" src={c.thumb} alt="" referrerPolicy="no-referrer" /> : <Video {...ICON} />,
      checked: c.id === current.id, onSelect: () => router.push(`/dashboard/${c.id}`),
    })),
    ...(channels.length ? [{ type: "sep" } as MenuEntry] : []),
    ...(signInReady ? [{ label: channels.length ? "Add another channel…" : "Connect your channel…", icon: <Plus {...ICON} />, onSelect: () => { window.location.href = "/api/auth/google"; } } as MenuEntry] : []),
    { label: "Demo channel", icon: <BarChart3 {...ICON} />, desc: "Bundled sample data", checked: current.id === "demo", onSelect: () => router.push("/dashboard/demo") },
  ];

  return (
    <header className="toolbar" role="toolbar" aria-label="Hindsight">
      <Link href="/" className="brand" aria-label="Hindsight home"><Logo /> <span>Hindsight</span></Link>
      <div className="tb-sep" />
      <Menu entries={switcher} label="Switch channel" className="tb-doc" caret width={260}>
        {current.thumb ? <img className="avatar" src={current.thumb} alt="" referrerPolicy="no-referrer" /> : <Video {...ICON} />}
        <span className="tb-doc-title">{current.title}</span>
      </Menu>
      <nav className="tb-nav" aria-label="Sections">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          return (
            <Link key={t.slug} href={href} className="tb-btn has-label" aria-current={active?.slug === t.slug ? "page" : undefined}>
              <t.icon {...ICON} /><span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
      <Menu
        className="tb-btn tb-narrow has-label" label="Sections" align="start" caret
        entries={TABS.map<MenuEntry>((t) => ({ label: t.label, icon: <t.icon {...ICON} />, checked: active?.slug === t.slug, onSelect: () => router.push(t.slug ? `${base}/${t.slug}` : base) }))}
      >
        <span>{active?.label ?? "Menu"}</span>
      </Menu>
      <div className="tb-spacer" />
      <ThemeMenu />
      <Link href={`${base}/settings`} className="tb-btn" aria-label="Settings" data-tip="Settings" aria-current={path.endsWith("/settings") ? "page" : undefined}>
        <Settings {...ICON} />
      </Link>
      {demo && signInReady && (
        <a href="/api/auth/google" className="tb-btn tb-export has-label"><span>Connect channel</span></a>
      )}
    </header>
  );
}
