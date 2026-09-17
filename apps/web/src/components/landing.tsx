"use client";

import Link from "next/link";
import { CHAINS } from "@testnet-router/registry";
import { ChainIcon } from "./icons";
import { Tag } from "./ui";
import { WalletButton } from "./wallet-button";
import { Screens } from "./screens";
import { WatchAddressForm } from "./watch-address";
import type { useDiscovery } from "@/hooks/use-discovery";
import { pad2 } from "@/lib/format";

type DiscoveryData = NonNullable<ReturnType<typeof useDiscovery>["data"]>;

const STEPS: [string, string, string][] = [
  ["01", "Scan", "Balances on every registry chain, read from public RPCs in your browser."],
  ["02", "Discover", "What each provider can do right now: pools with liquidity, bridges with bytecode."],
  ["03", "Quote", "Every hop with the real amount, gas reserved on every chain the route touches."],
  ["04", "Simulate", "Gas budget, contract code hash and a calldata summary before the wallet opens."],
  ["05", "Sign", "One transaction at a time. Pause, resume, never burn twice."],
];

const FEATURES: { title: string; body: string; href: string; label: string }[] = [
  { title: "Only live capabilities", body: "Nothing is routed on the strength of a docs page. A provider earns an edge by answering a probe quote.", href: "/protocols", label: "Protocols" },
  { title: "Gas reserved, not guessed", body: "Every chain a route touches keeps enough native for its transactions, relayer fees and destination claims.", href: "/how-it-works", label: "How it works" },
  { title: "Never burns twice", body: "Nonce snapshots, on-chain burn recovery and a duplicate stop turn a wallet hiccup into a resume, not a second burn.", href: "/docs#execution", label: "Safety model" },
  { title: "Pooled bridges", body: "Balances leaving one chain through the same asset are gathered into a single bridge: fewer signatures, one claim.", href: "/docs#planner", label: "Planner" },
  { title: "Twenty testnets, eleven providers", body: "Circle CCTP and Gateway, Uniswap v2 / v3 / v4, Hyperlane, Stargate, Across, LI.FI and the OP bridges.", href: "/coverage", label: "Coverage" },
  { title: "History that stays", body: "Executions are archived, never deleted. Unminted CCTP burns are read from the chains and can be minted later.", href: "/activity", label: "Activity" },
];

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="display num text-2xl leading-none">{value}</div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

/** What discovery sees right now: provider health, live edges and every registry chain. */
function LiveModule({ discovery, loading, failed }: { discovery?: DiscoveryData; loading: boolean; failed: boolean }) {
  const providersOk = discovery ? discovery.summaries.filter((s) => s.ok).length : undefined;
  const providers = discovery ? discovery.summaries.length : undefined;
  return (
    <section className="module flex flex-col gap-5" aria-label="Live capabilities">
      <div className="flex items-center justify-between gap-2">
        <span className="label">Live right now</span>
        {loading ? <Tag>Discovering…</Tag> : failed ? <Tag tone="err">Discovery failed</Tag> : <Tag tone="ok">Live</Tag>}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat value={pad2(CHAINS.length)} label="networks" />
        <Stat value={providers !== undefined ? `${pad2(providersOk ?? 0)}/${pad2(providers)}` : "…"} label="providers answering" />
        <Stat value={discovery ? discovery.graph.size : "…"} label="live edges" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-4 sm:grid-cols-3">
        {CHAINS.map((c) => (
          <span key={c.id} className="flex min-w-0 items-center gap-1.5 text-xs" title={c.name}>
            <ChainIcon chainId={c.id} size={16} />
            <span className="truncate">{c.shortName}</span>
          </span>
        ))}
      </div>
      <Link href="/coverage" className="link-action self-start">
        Coverage by provider →
      </Link>
    </section>
  );
}

/** Home page before a wallet is connected or an address is watched. */
export function Landing({ discovery, loading, failed }: { discovery?: DiscoveryData; loading: boolean; failed: boolean }) {
  return (
    <div className="flex flex-col gap-12 py-10 md:gap-16 md:py-14">
      <section className="grid-12 items-center">
        <div className="col-span-4 flex flex-col gap-5 md:col-span-6 lg:col-span-7">
          <span className="label">Testnet router · {CHAINS.length} networks</span>
          <h1 className="display max-w-xl text-3xl leading-[1.1] md:text-5xl">Gather testnet dust into the chain and asset you need.</h1>
          <p className="max-w-lg text-base leading-relaxed text-muted">
            RouteDust scans a wallet across {CHAINS.length} testnets, quotes only what is live right now, keeps gas on every chain a route touches and simulates each transaction before you sign.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <WalletButton />
            <span className="text-sm text-muted">or watch an address</span>
            <WatchAddressForm compact />
          </div>
          <p className="meta">
            Signs in your wallet · no server-side keys · read-only while watching ·{" "}
            <Link href="/networks" className="underline-offset-2 hover:underline">
              add a testnet to your wallet
            </Link>
          </p>
        </div>
        <div className="col-span-4 md:col-span-6 lg:col-span-5">
          <LiveModule discovery={discovery} loading={loading} failed={failed} />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-label="How it works">
        <h2 className="display text-lg">
          How a route runs <span className="text-muted">/ {pad2(STEPS.length)}</span>
        </h2>
        <div className="module grid grid-cols-1 divide-y divide-border p-0 md:grid-cols-5 md:divide-x md:divide-y-0">
          {STEPS.map(([n, title, body]) => (
            <div key={n} className="flex flex-col gap-1 p-5">
              <span className="mono text-xs text-muted">{n}</span>
              <span className="display text-base">{title}</span>
              <span className="text-sm leading-relaxed text-muted">{body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6" aria-label="Screenshots">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-lg">
            What it looks like <span className="text-muted">/ {pad2(3)}</span>
          </h2>
          <Link href="/how-it-works#screens" className="link-action">
            All screens →
          </Link>
        </div>
        <Screens limit={3} />
      </section>

      <section className="flex flex-col gap-6" aria-label="Why RouteDust">
        <h2 className="display text-lg">
          Why RouteDust <span className="text-muted">/ {pad2(FEATURES.length)}</span>
        </h2>
        <div className="module p-0">
          <div className="module-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="flex flex-col gap-2">
                <span className="mono text-xs text-muted">{pad2(i + 1)}</span>
                <span className="display text-lg">{f.title}</span>
                <span className="text-sm leading-relaxed text-muted">{f.body}</span>
                <Link href={f.href} className="link-action mt-auto self-start pt-1">
                  {f.label} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
