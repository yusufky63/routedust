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

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}

/** Light / dark as a two-state pill; the pressed side is raised. */
function ThemeToggle() {
  const theme = useRouterStore((s) => s.settings.theme);
  const setSettings = useRouterStore((s) => s.setSettings);
  return (
    <div role="group" aria-label="Theme" className="theme-toggle">
      <button type="button" aria-label="Light theme" aria-pressed={theme === "light"} title="Light theme" onClick={() => setSettings({ theme: "light" })}>
        <SunIcon />
      </button>
      <button type="button" aria-label="Dark theme" aria-pressed={theme === "dark"} title="Dark theme" onClick={() => setSettings({ theme: "dark" })}>
        <MoonIcon />
      </button>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
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
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <WalletButton />
        </div>

        {/* No overflow container here: a dropdown inside overflow-x:auto gets clipped. */}
        <nav className="hidden flex-wrap items-center gap-1 md:flex" aria-label="Primary">
          {PRIMARY.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="nav-link" data-active={active || undefined} aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="nav-link"
              data-active={networkActive || menuOpen || undefined}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              Network
              <span aria-hidden className="mono ml-1 text-xs text-muted">
                {menuOpen ? "▴" : "▾"}
              </span>
            </button>
            {menuOpen ? (
              <div role="menu" className="popover absolute left-0 top-[calc(100%+8px)] z-40 flex w-72 flex-col">
                {NETWORK_MENU.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link key={n.href} href={n.href} role="menuitem" className="popover-item flex-col items-start gap-0.5 py-2" data-active={active || undefined}>
                      <span className="font-medium">{n.label}</span>
                      {n.hint ? <span className="text-xs text-muted">{n.hint}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
          <Link href="/settings" className="nav-link" data-active={pathname.startsWith("/settings") || undefined} title="Settings">
            Settings
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <span className="label hidden lg:inline">{pad2(CHAINS.length)} networks</span>
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
