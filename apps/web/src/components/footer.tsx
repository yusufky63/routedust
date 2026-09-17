import Link from "next/link";
import { CHAINS, REGISTRY_VERIFIED_AT } from "@testnet-router/registry";
import { LogoMark, PRODUCT_NAME } from "./logo";
import { isoDate } from "@/lib/format";

const GROUPS: { title: string; items: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    items: [
      { href: "/", label: "Router" },
      { href: "/swap", label: "Swap" },
      { href: "/liquidity", label: "Liquidity" },
      { href: "/balances", label: "Balances" },
      { href: "/activity", label: "Activity" },
      { href: "/settings", label: "Settings" },
    ],
  },
  {
    title: "Network",
    items: [
      { href: "/networks", label: "Networks" },
      { href: "/protocols", label: "Protocols" },
      { href: "/coverage", label: "Coverage" },
      { href: "/faucets", label: "Faucets" },
    ],
  },
  {
    title: "Learn",
    items: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/docs", label: "Docs" },
      { href: "https://github.com/yusufky63/dustline", label: "Source on GitHub", external: true },
      { href: "https://github.com/yusufky63/dustline/blob/main/CHANGELOG.md", label: "Changelog", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="display text-sm uppercase tracking-[0.12em]">{PRODUCT_NAME}</span>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-muted">
            Testnet router: scans a wallet across {CHAINS.length} testnets, quotes only live capabilities, reserves gas, simulates before every signature and never burns twice.
          </p>
          <p className="mono text-[11px] text-muted">
            registry verified {isoDate(REGISTRY_VERIFIED_AT)} · no server-side keys · testnet assets have no market value
          </p>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-2">
            <span className="label">{g.title}</span>
            {g.items.map((it) =>
              it.external ? (
                <a key={it.href} href={it.href} target="_blank" rel="noreferrer noopener" className="mono text-[11px] uppercase tracking-[0.08em] text-muted hover:text-text">
                  {it.label} <span aria-hidden>↗</span>
                </a>
              ) : (
                <Link key={it.href} href={it.href} className="mono text-[11px] uppercase tracking-[0.08em] text-muted hover:text-text">
                  {it.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
    </footer>
  );
}
