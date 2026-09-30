"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NETWORK_NAV, owns, type NavItem } from "./nav";

const ITEMS: NavItem[] = [
  { href: "/", label: "Router" },
  { href: "/swap", label: "Swap" },
  { href: "/balances", label: "Balances" },
  { href: "/activity", label: "Activity" },
];

/** Everything the bottom bar has no room for: the header's other entries, then the reading. */
const MORE: NavItem[] = [
  { href: "/bridges", label: "Bridges", hint: "each testnet's own bridge, and the way off" },
  { href: "/faucets", label: "Faucets", hint: "sources of test funds, easiest first" },
  ...NETWORK_NAV,
  { href: "/settings", label: "Settings" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
];

const TAB = "flex-1 border-t-2 py-3 text-center text-sm font-medium";

/**
 * Phone and tablet bottom bar. Lives outside the header on purpose: a fixed element
 * inside the header's backdrop-filter would be positioned inside the header.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some((n) => owns(n, pathname, MORE));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav ref={ref} className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-bg/95 backdrop-blur lg:hidden" aria-label="Primary (mobile)">
      {ITEMS.map((n) => {
        const active = owns(n, pathname, ITEMS);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`${TAB} ${active ? "-mt-px border-text text-text" : "border-transparent text-muted"}`}
          >
            {n.label}
          </Link>
        );
      })}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${TAB} ${moreActive || open ? "-mt-px border-text text-text" : "border-transparent text-muted"}`}
      >
        More
      </button>
      {open ? (
        <div role="menu" className="popover absolute bottom-[calc(100%+8px)] right-2 z-40 flex max-h-[70vh] w-72 flex-col overflow-y-auto">
          {MORE.map((n) => {
            const active = owns(n, pathname, MORE);
            return (
              <Link key={n.href} href={n.href} role="menuitem" className="popover-item flex-col items-start gap-0.5 py-2" data-active={active || undefined}>
                <span className="font-medium">{n.label}</span>
                {n.hint ? <span className="text-xs text-muted">{n.hint}</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
