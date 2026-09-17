"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { CoverageChain, CoverageReport } from "@testnet-router/providers";
import { Button, ExternalLink, KeyValue, Label, Module, PageTitle, Tag, TableCard } from "@/components/ui";
import { useDiscovery } from "@/hooks/use-discovery";
import { pad2, timeAgo } from "@/lib/format";

type Filter = "all" | "registry" | "candidates" | "circle";

const PROVIDER_COLUMNS: { key: keyof CoverageChain["providers"]; label: string }[] = [
  { key: "circle", label: "Circle CCTP" },
  { key: "uniswap", label: "Uniswap" },
  { key: "across", label: "Across" },
  { key: "lifi", label: "LI.FI" },
  { key: "layerzero", label: "LayerZero" },
  { key: "hyperlane", label: "Hyperlane" },
];

/** Live edges per (provider, chain) from the running discovery, used to contrast feeds with reality. */
type LiveIndex = Map<string, number>;

function cell(chain: CoverageChain, key: keyof CoverageChain["providers"], live?: LiveIndex) {
  const p = chain.providers[key];
  const liveCount = live?.get(`${key}:${chain.chainId}`);
  if (!p) return <span className="text-muted">—</span>;
  switch (key) {
    case "circle": {
      const c = chain.providers.circle!;
      return (
        <span className="flex flex-wrap items-center gap-1">
          <Tag tone={c.chainIdConfidence === "verified" ? "ok" : "warn"}>DOMAIN {c.domain}</Tag>
          {c.fastTransfer ? <Tag tone="accent">FAST</Tag> : null}
        </span>
      );
    }
    case "uniswap": {
      const u = chain.providers.uniswap!;
      return (
        <span className="flex flex-wrap gap-1">
          {u.v3 ? <Tag tone="ok">V3</Tag> : null}
          {u.v4 ? <Tag>V4</Tag> : null}
          {!u.v3 && !u.v4 ? <Tag tone="warn">PARTIAL</Tag> : null}
          {chain.inRegistry && live ? (
            liveCount ? (
              <Tag tone="accent" title="Live pools with liquidity found by discovery">LIVE POOLS</Tag>
            ) : (
              <Tag tone="warn" title="Listed in the feed but no live pool/contract found on-chain">NO LIVE POOL</Tag>
            )
          ) : null}
        </span>
      );
    }
    case "across":
      return <Tag tone="ok">{chain.providers.across!.tokens.join(" · ") || "ROUTES"}</Tag>;
    case "lifi":
      return <Tag tone="ok">LISTED</Tag>;
    case "layerzero":
      return <Tag tone="ok">EID {chain.providers.layerzero!.eid}</Tag>;
    case "hyperlane":
      return <Tag tone="ok">{chain.providers.hyperlane!.name}</Tag>;
    default:
      return null;
  }
}

function ChainRow({ chain, live }: { chain: CoverageChain; live?: LiveIndex }) {
  return (
    <tr>
      <td className="py-3 pr-4">
        <details className="group">
          <summary className="flex items-center gap-2">
            <span className="text-sm">{chain.name}</span>
            <span className="mono text-xs text-muted group-open:hidden">+</span>
            <span className="mono hidden text-xs text-muted group-open:inline">−</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-xs">
            <KeyValue
              rows={[
                ["Chain ID", String(chain.chainId)],
                ["Native", chain.nativeSymbol ? `${chain.nativeSymbol} (${chain.nativeDecimals ?? "?"} dec)` : "unknown (not on chainid.network)"],
                ["RPC", chain.rpc.length ? chain.rpc.slice(0, 3).join("\n") : "—"],
                ["Faucets", chain.faucets.length ? chain.faucets.slice(0, 3).map((f, i) => <ExternalLink key={i} href={f}>{f.replace(/^https?:\/\//, "").slice(0, 48)}</ExternalLink>) : "—"],
                ["Explorer", chain.explorers[0] ? <ExternalLink href={chain.explorers[0]}>{chain.explorers[0].replace(/^https?:\/\//, "")}</ExternalLink> : "—"],
                ...(chain.providers.uniswap?.factory
                  ? ([
                      ["Uniswap factory", chain.providers.uniswap.factory],
                      ["QuoterV2", chain.providers.uniswap.quoterV2 ?? "—"],
                      ["SwapRouter02", chain.providers.uniswap.swapRouter02 ?? "—"],
                    ] as [string, React.ReactNode][])
                  : []),
                ...(chain.providers.across?.spokePool ? ([["Across SpokePool", chain.providers.across.spokePool]] as [string, React.ReactNode][]) : []),
                ...(chain.providers.layerzero ? ([["LayerZero", `${chain.providers.layerzero.chainKey} · endpoint ${chain.providers.layerzero.endpoint ?? "?"}`]] as [string, React.ReactNode][]) : []),
                ...(chain.providers.circle?.note ? ([["Circle note", chain.providers.circle.note]] as [string, React.ReactNode][]) : []),
              ]}
            />
            {!chain.inRegistry ? (
              <p className="text-muted">
                To add: append a chain entry (id, RPC, native asset, explorer, faucets) to <code>packages/registry/src/chains.ts</code>
                {chain.providers.circle ? ", the Circle USDC address to assets.ts and the CCTP domain to cctp.ts" : ""}. Providers then discover routes at runtime.
              </p>
            ) : null}
          </div>
        </details>
      </td>
      <td className="mono py-3 pr-4 text-xs">{chain.chainId}</td>
      <td className="py-3 pr-4 text-xs">{chain.nativeSymbol ?? <span className="text-muted">?</span>}</td>
      {PROVIDER_COLUMNS.map((col) => (
        <td key={col.key} className="py-3 pr-4 text-xs">
          {cell(chain, col.key, live)}
        </td>
      ))}
      <td className="py-3 pr-2">
        {chain.inRegistry ? <Tag tone="accent">IN REGISTRY</Tag> : <Tag tone={chain.score >= 3 ? "ok" : "muted"}>{chain.score} PROVIDERS</Tag>}
      </td>
    </tr>
  );
}

export default function CoveragePage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ["coverage"],
    queryFn: async () => {
      const res = await fetch("/api/coverage");
      if (!res.ok) throw new Error(`coverage ${res.status}`);
      return (await res.json()) as CoverageReport;
    },
    staleTime: 15 * 60_000,
  });
  const report = query.data;
  const discovery = useDiscovery();
  const live = useMemo<LiveIndex | undefined>(() => {
    if (!discovery.data) return undefined;
    const idx: LiveIndex = new Map();
    for (const e of discovery.data.edges) {
      const provider = e.provider === "circle-cctp" ? "circle" : e.provider.startsWith("uniswap") ? "uniswap" : e.provider;
      const key = `${provider}:${e.from.chainId}`;
      idx.set(key, (idx.get(key) ?? 0) + 1);
    }
    return idx;
  }, [discovery.data]);
  const candidates = (report?.chains ?? []).filter((c) => !c.inRegistry);
  const circleCandidates = candidates.filter((c) => c.providers.circle);
  const chains = (report?.chains ?? []).filter((c) =>
    filter === "registry" ? c.inRegistry : filter === "candidates" ? !c.inRegistry : filter === "circle" ? !c.inRegistry && Boolean(c.providers.circle) : true,
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/coverage?refresh=1");
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageTitle title="Coverage" meta="Which testnets each provider supports right now · aggregated from public registries · candidates for the chain registry">
        <Button onClick={() => void refresh()} disabled={refreshing || query.isFetching}>
          {refreshing || query.isFetching ? "Refreshing…" : "Refresh feeds"}
        </Button>
      </PageTitle>

      <div className="grid-12">
        <Module className="col-span-4 md:col-span-7">
          <Label>Sources</Label>
          <div className="mt-2 flex flex-col">
            {(report?.sources ?? []).map((s) => (
              <div key={s.key} className="rule flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <Tag tone={s.ok ? "ok" : "err"}>{s.ok ? (s.kind === "docs" ? "DOCS" : "LIVE") : "DOWN"}</Tag>
                  {s.name}
                  <span className="mono text-muted">{s.count} entries</span>
                  {s.error ? <span className="mono text-error">{s.error.slice(0, 80)}</span> : null}
                </span>
                <ExternalLink href={s.url}>{s.url.replace(/^https?:\/\//, "").slice(0, 52)}</ExternalLink>
              </div>
            ))}
            {query.isLoading ? <div className="py-2 text-xs text-muted">Fetching six registries…</div> : null}
          </div>
        </Module>
        <Module className="col-span-4 flex flex-col gap-3 md:col-span-5">
          <Label>Summary</Label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="display num text-3xl leading-none">{pad2(report?.chains.filter((c) => c.inRegistry).length ?? 0)}</div>
              <div className="label mt-2">in registry</div>
            </div>
            <div>
              <div className="display num text-3xl leading-none">{pad2(candidates.length)}</div>
              <div className="label mt-2">candidate testnets</div>
            </div>
            <div>
              <div className="display num text-3xl leading-none">{pad2(candidates.filter((c) => c.score >= 3).length)}</div>
              <div className="label mt-2">with 3+ providers</div>
            </div>
          </div>
          <p className="text-xs text-muted">
            Circle publishes domains, not chain ids: a green domain tag means the id was cross-checked with chainid.network. {report?.circleUnmapped.length ?? 0} Circle
            entries are non-EVM or unresolved.
          </p>
          {report ? <div className="mono text-xs text-muted">generated {timeAgo(report.generatedAt)}</div> : null}
        </Module>
      </div>

      <TableCard
        className="mt-6"
        title="Testnets"
        count={chains.length}
        right={
          <>
        {(["all", "registry", "candidates", "circle"] as Filter[]).map((f) => (
          <Button key={f} size="sm" active={filter === f} onClick={() => setFilter(f)} title={f === "circle" ? "Candidates with Circle USDC: routable through CCTP as soon as they are added" : undefined}>
            {f === "all"
              ? `All (${report?.chains.length ?? 0})`
              : f === "registry"
                ? "In registry"
                : f === "candidates"
                  ? `Candidates (${candidates.length})`
                  : `Circle USDC candidates (${circleCandidates.length})`}
          </Button>
        ))}
          </>
        }
      >
        <table className="table min-w-[1080px]">
          <thead>
            <tr>
              <th>Testnet</th>
              <th>Chain ID</th>
              <th>Native</th>
              {PROVIDER_COLUMNS.map((c) => (
                <th key={c.key}>
                  {c.label}
                </th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <ChainRow key={c.chainId} chain={c} live={live} />
            ))}
            {query.error ? (
              <tr>
                <td colSpan={10} className="py-3 text-error">
                  {(query.error as Error).message}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      {report && report.circleUnmapped.length > 0 ? (
        <Module className="mt-6">
          <Label>Circle CCTP entries without an EVM chain id</Label>
          <ul className="mono mt-2 flex flex-col gap-1 text-xs text-muted">
            {report.circleUnmapped.map((u) => (
              <li key={`${u.domain}-${u.name}`}>
                domain {u.domain} · {u.name} · {u.vm}
              </li>
            ))}
          </ul>
        </Module>
      ) : null}
    </div>
  );
}
