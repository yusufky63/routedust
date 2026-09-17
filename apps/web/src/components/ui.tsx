"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

/**
 * Card surface. Padding, radius, border and shadow come from `.module`
 * (16px on phones, 20px from md); pass `p-0` etc. to override.
 */
export function Module({
  children,
  className = "",
  raised = false,
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`${raised ? "module-raised" : "module"} ${className}`}>{children}</Tag>;
}

export function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: "ok" | "warn" | "err" | "accent" }) {
  const color =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : tone === "err" ? "text-error" : tone === "accent" ? "text-accent" : "";
  return (
    <div className="flex items-baseline gap-3">
      <span className={`display num text-2xl leading-none md:text-3xl ${color}`}>{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

export function Tag({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "err" | "muted" | "accent";
  title?: string;
}) {
  const cls = tone === "ok" ? "tag-ok" : tone === "warn" ? "tag-warn" : tone === "err" ? "tag-err" : tone === "accent" ? "tag-accent" : "";
  return (
    <span className={`tag ${cls}`} title={title}>
      {children}
    </span>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <div className={`rule ${className}`} />;
}

/**
 * Button states come from `.btn` (default, hover, focus-visible, active,
 * disabled, aria-busy). `variant`: default outline · accent outline · solid
 * (the single primary action on a surface). `size`: sm 24px · md 30px · lg 38px.
 */
export function Button({
  children,
  onClick,
  disabled,
  busy = false,
  variant = "default",
  size = "md",
  active = false,
  type = "button",
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** In-flight action: keeps the label, sets aria-busy and a progress cursor. */
  busy?: boolean;
  variant?: "default" | "accent" | "solid";
  size?: "sm" | "md" | "lg";
  active?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const v = variant === "accent" ? "btn-accent" : variant === "solid" ? "btn-solid" : "";
  const s = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn ${v} ${s} ${active ? "btn-active" : ""} ${className}`}
      title={title}
    >
      {children}
    </button>
  );
}

/** Borderless text action (`Reset`, `Clear`, `Why this route?`). */
export function LinkAction({
  children,
  onClick,
  disabled,
  active = false,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-active={active || undefined} className={`link-action ${className}`} title={title}>
      {children}
    </button>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={`mono text-xs underline-offset-2 hover:underline ${className}`}>
      {children} <span aria-hidden>↗</span>
    </a>
  );
}

export function PageTitle({ title, meta, children }: { title: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="display text-2xl md:text-3xl">{title}</h1>
        {meta ? <p className="mt-1 max-w-2xl text-sm text-muted">{meta}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Custom select: a button showing the current option (icon + label) and a
 * popover listbox with an optional search box. Keyboard: arrows, Enter, Escape.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  placeholder = "Select…",
  searchable,
  className = "",
  align = "left",
  buttonHint = true,
}: {
  value?: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  align?: "left" | "right";
  /** Show the selected option's hint inside the button (off for long descriptions). */
  buttonHint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }, [open, options, value]);

  const pick = (o: SelectOption<T>) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(visible.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visible[cursor];
      if (o) pick(o);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`btn w-full justify-between text-left ${open ? "btn-active" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon}
          <span className="truncate">{current?.label ?? placeholder}</span>
          {buttonHint && current?.hint ? <span className="mono hidden text-xs uppercase tracking-caps text-muted md:inline">{current.hint}</span> : null}
        </span>
        <span className="mono text-xs text-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className={`popover absolute z-30 mt-1 max-h-80 w-max min-w-full max-w-[min(90vw,28rem)] overflow-auto ${align === "right" ? "right-0" : "left-0"}`} role="listbox">
          {searchable ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              placeholder="Search"
              className="mb-1 w-full"
              aria-label={`Search ${ariaLabel}`}
            />
          ) : null}
          {visible.length === 0 ? <div className="meta px-2 py-1">no match</div> : null}
          {visible.map((o, i) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-active={i === cursor || undefined}
              disabled={o.disabled}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o)}
              className="popover-item"
            >
              {o.icon}
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{o.label}</span>
                {o.hint ? <span className="mono text-xs uppercase tracking-caps text-muted">{o.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A data table inside a module: optional header strip (title, count, hint,
 * actions), horizontal scrolling body, cells flush with the card padding.
 */
export function TableCard({
  title,
  count,
  hint,
  right,
  children,
  className = "",
}: {
  title?: string;
  count?: number;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`module table-card flex flex-col p-0 ${className}`}>
      {title || right ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div className="min-w-0">
            {title ? (
              <h2 className="display text-base">
                {title}
                {count !== undefined ? <span className="text-muted"> / {String(count).padStart(2, "0")}</span> : null}
              </h2>
            ) : null}
            {hint ? <p className="text-xs text-muted">{hint}</p> : null}
          </div>
          {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
        </header>
      ) : null}
      <div className="scroll-x">{children}</div>
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <Module className="module-empty">
      <div className="display text-lg">{title}</div>
      {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
      {action ? (
        <Link href={action.href} className="btn btn-accent mt-4">
          {action.label}
        </Link>
      ) : null}
    </Module>
  );
}

export function Marker({ color }: { color?: string }) {
  return <span className="marker" style={{ background: color ?? "var(--muted)" }} aria-hidden />;
}

export function KeyValue({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="label">{k}</dt>
          <dd className="mono break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
