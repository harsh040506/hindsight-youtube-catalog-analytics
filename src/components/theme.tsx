"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ICON, Menu, Segmented } from "./ui";

export type ThemePref = "system" | "light" | "dark";
const KEY = "hindsight:theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(p: ThemePref) {
  document.documentElement.dataset.theme = p === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => setPref(read()), []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  const set = (p: ThemePref) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* private mode */ }
    apply(p);
  };
  return [pref, set] as const;
}

/** Inline script that sets data-theme before first paint, so dark-mode users never see a white flash. */
export const THEME_INIT = `try{var s=localStorage.getItem("${KEY}");document.documentElement.dataset.theme=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}`;

const OPTS = [
  { value: "system" as const, label: "System", icon: <Monitor size={14} strokeWidth={1.5} /> },
  { value: "light" as const, label: "Light", icon: <Sun size={14} strokeWidth={1.5} /> },
  { value: "dark" as const, label: "Dark", icon: <Moon size={14} strokeWidth={1.5} /> },
];

export function ThemeMenu() {
  const [pref, set] = useTheme();
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <Menu
      label="Theme" tip="Theme" align="end"
      entries={OPTS.map((o) => ({ label: o.label, icon: o.icon, checked: pref === o.value, onSelect: () => set(o.value) }))}
    >
      <Icon {...ICON} />
    </Menu>
  );
}

export function ThemeSetting() {
  const [pref, set] = useTheme();
  return <Segmented label="Theme" value={pref} options={OPTS} onChange={set} />;
}
