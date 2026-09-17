"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@testnet-router/registry";
import { Logo } from "./logo";
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
  { href: "/networks", label: "Networks", hint: "chains, native gas, RPC health, add to wallet" },
  { href: "/protocols", label: "Protocols", hint: "live provider capabilities" },
  { href: "/coverage", label: "Coverage", hint: "which testnets each provider supports" },
  { href: "/faucets", label: "Faucets", hint: "official and third-party sources" },
  { href: "/liquidity", label: "Liquidity", hint: "create a pool for your own token" },
];

function navClass(active: boolean): string {
  return `mono whitespace-nowrap border-b px-2 py-1 text-[11px] uppercase tracking-[0.08em] ${active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`;
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
    <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-4 py-3 md:px-6">
        <Logo />
        {/* Phones get the bottom bar instead of a second header row. */}
        <div className="flex items-center gap-3 md:hidden">
          <button type="button" className="label hover:text-text" onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })} title="Toggle theme">
            {theme === "dark" ? "DARK" : "LIGHT"}
          </button>
          <WalletButton />
        </div>

        {/* No overflow container here: a dropdown inside overflow-x:auto gets clipped. */}
        <nav className="hidden flex-wrap items-center gap-1 md:flex" aria-label="Primary">
          {PRIMARY.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={navClass(active)}>
                {n.label}
              </Link>
            );
          })}
          <div className="relative" ref={menuRef}>
            <button type="button" className={navClass(networkActive || menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              Network <span aria-hidden className="ml-1 inline-block text-[9px]">{menuOpen ? "▲" : "▼"}</span>
            </button>
            {menuOpen ? (
              <div role="menu" className="module absolute left-0 top-[calc(100%+8px)] z-40 flex w-72 flex-col !p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                {NETWORK_MENU.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link key={n.href} href={n.href} role="menuitem" className={`flex flex-col gap-0.5 px-3 py-2.5 hover:bg-raised ${active ? "bg-raised" : ""}`}>
                      <span className={`mono text-[11px] uppercase tracking-[0.08em] ${active ? "text-text" : "text-text"}`}>{n.label}</span>
                      {n.hint ? <span className="text-xs text-muted">{n.hint}</span> : null}
                    </Link>
                  );
                })}
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
