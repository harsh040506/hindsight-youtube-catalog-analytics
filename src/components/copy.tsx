"use client";

import { Copy } from "lucide-react";
import { ICON, toast } from "./ui";

export function CopyField({ value, label }: { value: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied", "success");
    } catch {
      toast("Couldn’t copy. Select the text and copy it manually.", "error");
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="input mono" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-ghost" onClick={copy} aria-label={`Copy ${label}`}><Copy {...ICON} /> Copy</button>
    </div>
  );
}
