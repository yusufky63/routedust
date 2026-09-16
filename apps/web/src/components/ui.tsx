"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>;
}

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
  return <Tag className={`${raised ? "module-raised" : "module"} p-4 md:p-5 ${className}`}>{children}</Tag>;
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

export function Button({
  children,
  onClick,
  disabled,
  variant = "default",
  active = false,
  type = "button",
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "accent" | "solid";
  active?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const v = variant === "accent" ? "btn-accent" : variant === "solid" ? "btn-solid" : "";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`btn ${v} ${active ? "btn-active" : ""} ${className}`} title={title}>
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
        {meta ? <div className="label mt-1">{meta}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <Module className="text-center">
      <div className="display text-lg">{title}</div>
      {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
      {action ? (
        <Link href={action.href} className="btn btn-accent mt-4 inline-block">
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
