"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@testnet-router/registry";
import { WalletButton } from "./wallet-button";
import { useRouterStore } from "@/lib/store";
import { pad2 } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  hint?: string;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Router" },
  { href: "/swap", label: "Swap" },
  { href: "/balances", label: "Balances" },
  { href: "/activity", label: "Activity" },
];

const NETWORK_MENU: NavItem[] = [
  { href: "/networks", label: "Networks", hint: "chains, native gas, RPC health" },
  { href: "/protocols", label: "Protocols", hint: "live provider capabilities" },
  { href: "/coverage", label: "Coverage", hint: "which testnets each provider supports" },
  { href: "/faucets", label: "Faucets", hint: "official and third-party sources" },
];

function navClass(active: boolean): string {
  return `mono whitespace-nowrap border-b px-2 py-1 text-[11px] uppercase tracking-[0.08em] ${active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Testnet Router home">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <rect x="1" y="1" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 14 L9 6 L11 10 L16 6" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="6" r="1.6" fill="var(--accent)" />
      </svg>
      <span className="display text-sm font-semibold tracking-[0.12em]">TESTNET ROUTER</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const theme = useRouterStore((s) => s.settings.theme);
  const setSettings = useRouterStore((s) => s.setSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const networkActive = NETWORK_MENU.some((n) => pathname.startsWith(n.href));

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center justify-between gap-6">
          <Logo />
          <div className="flex items-center gap-3 md:hidden">
            <WalletButton />
          </div>
        </div>

        <nav className="scroll-x -mx-4 flex items-center gap-1 px-4 md:mx-0 md:px-0" aria-label="Primary">
          {PRIMARY.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={navClass(active)}>
                {n.label}
              </Link>
            );
          })}
          <div className="relative" ref={menuRef}>
            <button type="button" className={navClass(networkActive)} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              Network {menuOpen ? "▴" : "▾"}
            </button>
            {menuOpen ? (
              <div role="menu" className="module absolute left-0 top-full z-30 mt-2 flex w-64 flex-col !p-2">
                {NETWORK_MENU.map((n) => (
                  <Link key={n.href} href={n.href} role="menuitem" className={`flex flex-col px-2 py-2 hover:bg-raised ${pathname.startsWith(n.href) ? "text-text" : "text-muted"}`}>
                    <span className="mono text-[11px] uppercase tracking-[0.08em]">{n.label}</span>
                    {n.hint ? <span className="text-xs text-muted">{n.hint}</span> : null}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <Link href="/settings" className={navClass(pathname.startsWith("/settings"))} title="Settings">
            Settings
          </Link>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <button
            type="button"
            className="label hover:text-text"
            onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })}
            title="Toggle theme"
          >
            {theme === "dark" ? "DARK" : "LIGHT"}
          </button>
          <span className="label">{pad2(CHAINS.length)} NETWORKS</span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
