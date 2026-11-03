"use client";

import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ICON = { size: 16, strokeWidth: 1.5 } as const;

/* ---------- positioning ---------- */
function place(el: HTMLElement, r: DOMRect, side: "bottom" | "top" = "bottom", align: "start" | "end" | "center" = "start", gap = 6) {
  el.style.left = "0px";
  el.style.top = "0px";
  el.style.visibility = "hidden";
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  if (side === "bottom" && r.bottom + gap + h > vh - 8 && r.top - gap - h >= 8) side = "top";
  const y = side === "bottom" ? r.bottom + gap : r.top - gap - h;
  let x = align === "end" ? r.right - w : align === "center" ? r.left + r.width / 2 - w / 2 : r.left;
  x = Math.min(Math.max(8, x), Math.max(8, vw - w - 8));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(Math.min(Math.max(8, y), Math.max(8, vh - h - 8)))}px`;
  el.style.visibility = "";
  el.dataset.side = side;
}

function useLayer() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("layer")), []);
  return el;
}

/* ---------- menu ---------- */
export type MenuEntry =
  | { type?: "item"; label: string; icon?: ReactNode; desc?: string; hint?: string; checked?: boolean; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "header"; label: string }
  | { type: "sep" };

export function Menu({
  entries, children, label, className = "tb-btn", align = "start", caret, tip, width,
}: {
  entries: MenuEntry[]; children: ReactNode; label: string; className?: string; align?: "start" | "end";
  caret?: boolean; tip?: string; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const layer = useLayer();
  const items = entries.map((e, i) => ({ e, i })).filter((x) => (x.e.type ?? "item") === "item" && !(x.e as { disabled?: boolean }).disabled);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open && btn.current && pop.current) place(pop.current, btn.current.getBoundingClientRect(), "bottom", align);
  }, [open, align, entries.length]);

  useEffect(() => {
    if (!open) return;
    const down = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const resize = () => btn.current && pop.current && place(pop.current, btn.current.getBoundingClientRect(), "bottom", align);
    const blur = () => close(false);
    document.addEventListener("pointerdown", down);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
    };
  }, [open, close, align]);

  function key(ev: React.KeyboardEvent) {
    if (!open) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); setOpen(true); setActive(items[0]?.i ?? -1); }
      return;
    }
    const pos = items.findIndex((x) => x.i === active);
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); setActive(items[(pos + 1) % items.length]?.i ?? -1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive(items[(pos - 1 + items.length) % items.length]?.i ?? -1); }
    else if (ev.key === "Home") { ev.preventDefault(); setActive(items[0]?.i ?? -1); }
    else if (ev.key === "End") { ev.preventDefault(); setActive(items[items.length - 1]?.i ?? -1); }
    else if (ev.key === "Enter" || ev.key === " ") {
      const e = entries[active];
      if (e && (e.type ?? "item") === "item") { ev.preventDefault(); close(); (e as { onSelect: () => void }).onSelect(); }
    } else if (ev.key === "Tab") close(false);
  }

  return (
    <>
      <button
        ref={btn} type="button" className={`${className}${open ? " is-open" : ""}${caret ? " has-caret" : ""}`}
        aria-haspopup="menu" aria-expanded={open} aria-label={label} data-tip={tip}
        onClick={() => { setOpen((o) => !o); setActive(-1); }} onKeyDown={key}
      >
        {children}
        {caret && <span className="tb-caret"><ChevronDown size={12} strokeWidth={1.5} /></span>}
      </button>
      {open && layer && createPortal(
        <div className="pop" ref={pop} onKeyDown={key}>
          <div className="menu" role="menu" style={width ? { minWidth: width } : undefined}>
            {entries.map((e, i) => {
              if (e.type === "sep") return <div key={i} className="menu-sep" role="separator" />;
              if (e.type === "header") return <div key={i} className="menu-header">{e.label}</div>;
              return (
                <button
                  key={i} type="button" role="menuitem" disabled={e.disabled}
                  className={`menu-item${active === i ? " is-active" : ""}${e.danger ? " is-danger" : ""}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => { close(); e.onSelect(); }}
                >
                  {e.icon !== undefined && <span className="menu-icon">{e.icon}</span>}
                  <span className="menu-label">
                    {e.label}
                    {e.desc && <span className="menu-desc">{e.desc}</span>}
                  </span>
                  {e.hint && <span className="menu-hint">{e.hint}</span>}
                  {e.checked && <span className="menu-check"><Check size={14} strokeWidth={1.75} /></span>}
                </button>
              );
            })}
          </div>
        </div>, layer,
      )}
    </>
  );
}

/* ---------- searchable picker (replaces a native <select>) ---------- */
export function Picker({ name, value, options, placeholder = "Search…" }: { name: string; value: string; options: string[]; placeholder?: string }) {
  const [val, setVal] = useState(value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const layer = useLayer();
  const shown = options.filter((o) => o.toLowerCase().includes(q.toLowerCase().replace(/ /g, "_"))).slice(0, 80);

  useLayoutEffect(() => {
    if (open && btn.current && pop.current) place(pop.current, btn.current.getBoundingClientRect());
  }, [open, shown.length]);
  useEffect(() => {
    if (!open) return;
    const down = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);

  const pick = (o: string) => { setVal(o); setOpen(false); setQ(""); btn.current?.focus(); };
  return (
    <>
      <input type="hidden" name={name} value={val} />
      <button ref={btn} type="button" className="input picker" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setActive(0); }}>
        <span>{val.replace(/_/g, " ")}</span>
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      {open && layer && createPortal(
        <div className="pop" ref={pop}>
          <div className="menu-with-filter">
            <input
              autoFocus className="input menu-filter" placeholder={placeholder} value={q} aria-label="Filter"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active]); }
                else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
              }}
            />
            <div className="menu menu-scroll" role="listbox">
              <div className="menu-list">
                {shown.length === 0 && <div className="menu-empty">No matches</div>}
                {shown.map((o, i) => (
                  <button key={o} type="button" role="option" aria-selected={o === val} className={`menu-item${i === active ? " is-active" : ""}`} onPointerMove={() => setActive(i)} onClick={() => pick(o)}>
                    <span className="menu-label">{o.replace(/_/g, " ")}</span>
                    {o === val && <span className="menu-check"><Check size={14} strokeWidth={1.75} /></span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>, layer,
      )}
    </>
  );
}

/* ---------- segmented control ---------- */
export function Segmented<T extends string>({ value, options, onChange, small, label }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; small?: boolean; label: string }) {
  return (
    <div className={`segmented${small ? " is-small" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="seg" onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Form-friendly segmented control that submits its value with a surrounding <form>. */
export function SegmentedField<T extends string>({ name, initial, options, label }: { name: string; initial: T; options: { value: T; label: string }[]; label: string }) {
  const [v, setV] = useState<T>(initial);
  return (
    <>
      <input type="hidden" name={name} value={v} />
      <Segmented value={v} options={options} onChange={setV} label={label} />
    </>
  );
}

/* ---------- dialog ---------- */
export function Dialog({ open, title, onClose, children, foot, width = 440 }: { open: boolean; title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; width?: number }) {
  const layer = useLayer();
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows; reading the latest through a ref keeps the effect (and focus) from re-running every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const raf = requestAnimationFrame(() => setShown(true));
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus],button,input")?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not([type=hidden]),a[href],[tabindex]:not([tabindex='-1'])")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keys);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", keys); prev?.focus?.(); };
  }, [open, layer]);
  if (!open || !layer) return null;
  return createPortal(
    <div className={`scrim${shown ? " is-in" : ""}`} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref}>
        <div className="dialog-head">
          <div className="dialog-title">{title}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X {...ICON} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {foot && <div className="dialog-foot">{foot}</div>}
      </div>
    </div>, layer,
  );
}

/** A form button that asks first, instead of window.confirm(). */
export function ConfirmButton({ label, title, text, confirmLabel, formAction, fields = {}, danger = true, className = "btn btn-ghost btn-sm", children }: {
  label: string; title: string; text: string; confirmLabel: string; formAction: string; fields?: Record<string, string>; danger?: boolean; className?: string; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children ?? label}</button>
      <form ref={form} action={formAction} method="post" hidden>
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      </form>
      <Dialog open={open} title={title} onClose={() => setOpen(false)} foot={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} data-autofocus onClick={() => form.current?.requestSubmit()}>{confirmLabel}</button>
        </>
      }>
        <p className="dialog-text">{text}</p>
      </Dialog>
    </>
  );
}

/* ---------- tooltips ---------- */
export function TooltipLayer() {
  useEffect(() => {
    let el: HTMLDivElement | null = null;
    let timer: number | undefined;
    let last = 0;
    const hide = () => { window.clearTimeout(timer); el?.remove(); el = null; };
    const show = (target: HTMLElement) => {
      const text = target.getAttribute("data-tip");
      if (!text) return;
      hide();
      el = document.createElement("div");
      el.className = "tooltip";
      el.setAttribute("role", "tooltip");
      el.textContent = text;
      document.getElementById("layer")?.appendChild(el);
      const r = target.getBoundingClientRect();
      place(el, r, "bottom", "center", 8);
      last = Date.now();
    };
    const over = (ev: Event) => {
      const t = (ev.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!t) return;
      window.clearTimeout(timer);
      if (Date.now() - last < 400 || ev.type === "focusin") show(t);
      else timer = window.setTimeout(() => show(t), 450);
    };
    const out = (ev: Event) => { if ((ev.target as HTMLElement | null)?.closest?.("[data-tip]")) { hide(); last = Date.now(); } };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", over);
    document.addEventListener("focusout", out);
    document.addEventListener("pointerdown", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", over);
      document.removeEventListener("focusout", out);
      document.removeEventListener("pointerdown", hide);
    };
  }, []);
  return null;
}

/* ---------- toasts ---------- */
export function toast(message: string, kind: "info" | "error" | "success" = "info") {
  window.dispatchEvent(new CustomEvent("hs:toast", { detail: { message, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string; in: boolean }[]>([]);
  useEffect(() => {
    let n = 0;
    const timers = new Set<number>();
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const message = typeof d.message === "string" ? d.message : "";
      if (!message) return;
      const kind = d.kind === "error" || d.kind === "success" ? d.kind : "info";
      const id = ++n;
      // Cap the stack so a burst of failures can't bury the page in toasts.
      setItems((x) => [...x.slice(-3), { id, message, kind, in: false }]);
      requestAnimationFrame(() => setItems((x) => x.map((t) => (t.id === id ? { ...t, in: true } : t))));
      const t = window.setTimeout(() => { timers.delete(t); setItems((x) => x.filter((i) => i.id !== id)); }, kind === "error" ? 6000 : 3600);
      timers.add(t);
    };
    window.addEventListener("hs:toast", on);
    return () => { window.removeEventListener("hs:toast", on); timers.forEach((t) => window.clearTimeout(t)); };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.in ? " is-in" : ""}${t.kind === "error" ? " is-error" : t.kind === "success" ? " is-success" : ""}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}


/**
 * A form wired to a server action with pending state, success toast and error recovery.
 * The submit button lives inside so it can disable itself and show progress.
 */
export function ActionForm({
  action, success, label, icon, className, btnClass = "btn btn-ghost btn-sm", footerClass, tip, children,
}: {
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  success?: string; label: string; icon?: ReactNode; className?: string; btnClass?: string; footerClass?: string; tip?: string; children?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      try {
        const r = await action(fd);
        if (r.ok) { if (success) toast(success, "success"); }
        else toast(r.error ?? "That didn’t work. Please try again.", "error");
      } catch {
        toast("That didn’t work. Check your connection and try again.", "error");
      }
    });
  const btn = (
    <button className={btnClass} disabled={pending} data-tip={tip} aria-busy={pending}>
      {pending ? <span className="spin"><LoaderCircle size={14} strokeWidth={1.5} /></span> : icon}{label}
    </button>
  );
  return (
    <form action={submit} className={className}>
      {children}
      {footerClass ? <div className={footerClass}>{btn}</div> : btn}
    </form>
  );
}

/** Remembers the visitor's time zone on first visit so hour-of-day findings are right without any setup. */
export function TimeZoneSync({ sync, needed }: { sync: (tz: string) => Promise<void>; needed: boolean }) {
  useEffect(() => {
    if (!needed) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Offline or a failed action just keeps the server default; it is retried on the next visit.
      if (tz) sync(tz).catch(() => {});
    } catch { /* keep the server default */ }
  }, [needed, sync]);
  return null;
}
