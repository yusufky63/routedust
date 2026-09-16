"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAINS } from "@testnet-router/registry";
import { WalletButton } from "./wallet-button";
import { useRouterStore } from "@/lib/store";
import { pad2 } from "@/lib/format";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Router" },
  { href: "/balances", label: "Balances" },
  { href: "/faucets", label: "Faucets" },
  { href: "/networks", label: "Networks" },
  { href: "/protocols", label: "Protocols" },
  { href: "/coverage", label: "Coverage" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function Header() {
  const pathname = usePathname();
  const theme = useRouterStore((s) => s.settings.theme);
  const setSettings = useRouterStore((s) => s.setSettings);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="display text-sm font-semibold tracking-[0.12em]">
            TESTNET ROUTER
          </Link>
          <div className="flex items-center gap-3 md:hidden">
            <span className="label">{pad2(CHAINS.length)} NETWORKS</span>
            <WalletButton />
          </div>
        </div>
        <nav className="scroll-x -mx-4 flex gap-1 px-4 md:mx-0 md:px-0" aria-label="Primary">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mono whitespace-nowrap border-b px-2 py-1 text-[11px] uppercase tracking-[0.08em] ${
                  active ? "border-text text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
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
