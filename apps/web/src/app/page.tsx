"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { MODE_LABELS, formatAmount, type RouteCandidate } from "@testnet-router/core";
import { findAsset, findChain } from "@testnet-router/registry";
import { DestinationSelector } from "@/components/destination-selector";
import { ModeSelector } from "@/components/mode-selector";
import { RouteCard } from "@/components/route-card";
import { Button, Empty, ExternalLink, Label, Module, Rule, Stat, Tag, useMounted } from "@/components/ui";
import { useDiscovery } from "@/hooks/use-discovery";
import { useExecutor } from "@/hooks/use-executor";
import { usePlan } from "@/hooks/use-plan";
import { useScan } from "@/hooks/use-scan";
import { pad2 } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

export default function RouterPage() {
  const mounted = useMounted();
  const router = useRouter();
  const { address } = useAccount();
  const discovery = useDiscovery();
  const { scan, scanning, progress, rescan } = useScan();
  const { plan, planning, progress: planProgress, error, runPlan, setMode } = usePlan(scan, discovery.data);
  const { create } = useExecutor();
  const settings = useRouterStore((s) => s.settings);
  const setSettings = useRouterStore((s) => s.setSettings);
  const autoPlanned = useRef<string | undefined>(undefined);

  // Plan automatically once per scan + destination; re-plan is always explicit afterwards.
  useEffect(() => {
    if (!scan || !discovery.data || planning) return;
    const key = `${scan.scannedAt}:${settings.destinationAssetId}`;
    if (autoPlanned.current === key) return;
    autoPlanned.current = key;
    void runPlan();
  }, [scan, discovery.data, planning, runPlan, settings.destinationAssetId]);

  if (!mounted) return null;

  if (!address) {
    return (
      <div className="flex flex-col gap-6 py-10">
        <div className="grid-12">
          <div className="col-span-4 md:col-span-7">
            <h1 className="display text-3xl leading-tight md:text-5xl">
              Route fragmented testnet balances into the exact chain and asset you want.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-muted md:text-base">
              Scans your wallet across {pad2(discovery.data?.summaries.length ?? 5)} providers and 10 testnets, reserves gas on every source chain,
              quotes and simulates every path, and never manufactures a route from protocol support alone.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Tag tone="accent">CIRCLE CCTP</Tag>
              <Tag>UNISWAP V3</Tag>
              <Tag>ACROSS TESTNET</Tag>
              <Tag>OP STANDARD BRIDGE</Tag>
              <Tag>NATIVE ≠ ETH</Tag>
            </div>
          </div>
          <div className="col-span-4 md:col-span-5">
            <Module>
              <Label>Get started</Label>
              <ol className="mono mt-3 flex flex-col gap-2 text-xs">
                <li>01 / Connect an injected wallet (top right)</li>
                <li>02 / Balances are scanned across all networks</li>
                <li>03 / Pick a target and route mode</li>
                <li>04 / Review live quotes, simulate, sign</li>
              </ol>
              <Rule className="my-4" />
              <div className="flex flex-wrap gap-3">
                <Link href="/faucets" className="btn">
                  Faucet Center
                </Link>
                <Link href="/networks" className="btn">
                  Networks
                </Link>
                <Link href="/protocols" className="btn">
                  Protocols
                </Link>
              </div>
            </Module>
          </div>
        </div>
      </div>
    );
  }

  const stats = plan?.stats;
  const routable = plan?.sources.filter((s) => s.status === "ROUTABLE") ?? [];
  const needGas = plan?.sources.filter((s) => s.status === "NEED_GAS") ?? [];
  const noRoute = plan?.sources.filter((s) => s.status === "NO_ROUTE") ?? [];
  const atTarget = plan?.sources.filter((s) => s.status === "TARGET") ?? [];
  const destAsset = findAsset(settings.destinationAssetId);
  const busy = scanning || planning || discovery.isLoading;

  const execute = (candidate: RouteCandidate) => {
    const ex = create(candidate);
    router.push(`/route/${ex.id}`);
  };

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="grid-12">
        <Module className="col-span-4 flex flex-col gap-4 md:col-span-5">
          <div className="flex items-center justify-between">
            <Label>Found</Label>
            <Button onClick={() => void rescan()} disabled={scanning}>
              {scanning ? `Scanning ${progress.length}/10` : "Rescan"}
            </Button>
          </div>
          {scan ? (
            <div className="flex flex-col gap-2">
              <Stat value={pad2(scan.chains.filter((c) => c.ok).length)} label="networks" />
              <Stat value={pad2(scan.chains.flatMap((c) => c.balances.filter((b) => b.raw > 0n)).length)} label="assets" />
              <Stat value={pad2(stats?.routable ?? 0)} label="routable" tone="ok" />
              <Stat value={pad2(stats?.needGas ?? 0)} label="need gas" tone={stats?.needGas ? "warn" : undefined} />
              <Stat value={pad2(stats?.noRoute ?? 0)} label="no route" tone={stats?.noRoute ? "err" : undefined} />
            </div>
          ) : (
            <div className="text-sm text-muted">{scanning ? `Scanning… ${progress.map((p) => findChain(p.chainId)?.shortName).join(", ")}` : "No scan yet."}</div>
          )}
          <Rule />
          <div className="mono text-[11px] text-muted">
            {discovery.isLoading
              ? "Discovering live capabilities…"
              : discovery.data
                ? `${discovery.data.graph.size} live edges from ${discovery.data.summaries.filter((s) => s.ok).length}/${discovery.data.summaries.length} providers`
                : "Discovery failed"}
            {scan ? ` · scanned ${new Date(scan.scannedAt).toLocaleTimeString()}` : ""}
          </div>
        </Module>
        <Module className="col-span-4 flex flex-col gap-4 md:col-span-7">
          <Label>Target</Label>
          <DestinationSelector assetId={settings.destinationAssetId} onChange={(id) => setSettings({ destinationAssetId: id })} disabled={planning} />
          <Rule />
          <ModeSelector mode={settings.mode} onChange={setMode} disabled={planning} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" onClick={() => void runPlan()} disabled={busy || !scan || !discovery.data}>
              {planning ? "Planning…" : "Plan routes"}
            </Button>
            {planProgress && planning ? (
              <span className="mono text-[11px] text-muted">
                {planProgress.completed ?? 0}/{planProgress.total ?? 0} · {planProgress.message}
              </span>
            ) : null}
            {error ? <span className="mono text-[11px] text-error">{error}</span> : null}
          </div>
        </Module>
      </div>

      {plan ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-4">
            <h2 className="display text-xl uppercase">
              {MODE_LABELS[plan.mode]} · {pad2(routable.length)} routes
            </h2>
            <span className="display num text-xl">
              Σ {formatAmount(plan.totalOut, destAsset?.decimals ?? 6)} {destAsset?.symbol}
            </span>
          </div>
          {routable.length === 0 ? <Empty title="NO EXECUTABLE ROUTE" hint="No source balance has a live, gas-covered path to the target right now. That is a valid answer; see the sections below for why." /> : null}
          {routable.map((s, i) => (
            <RouteCard key={s.id} index={i + 1} source={s} onExecute={execute} disabled={busy} />
          ))}

          {needGas.length > 0 ? (
            <Module className="flex flex-col gap-3">
              <Label>Source gas required · {pad2(needGas.length)}</Label>
              {needGas.map((s) => {
                const chain = findChain(s.sourceChainId);
                return (
                  <div key={s.id} className="rule flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="display num text-lg">
                        {formatAmount(s.balance, s.asset.decimals)} {s.asset.symbol} <span className="text-muted">on {chain?.name}</span>
                      </div>
                      <div className="mono text-[11px] text-warning">
                        need approximately {formatAmount(s.gas.shortfall > 0n ? s.gas.shortfall : s.gas.reserve, 18)} {chain?.nativeAsset.symbol} for route gas
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {s.faucets.slice(0, 3).map((f) => (
                        <ExternalLink key={f.id} href={f.url}>
                          {f.name}
                        </ExternalLink>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Module>
          ) : null}

          {noRoute.length > 0 ? (
            <Module className="flex flex-col gap-3">
              <Label>No route · {pad2(noRoute.length)}</Label>
              {noRoute.map((s) => (
                <details key={s.id} className="rule py-3">
                  <summary className="flex flex-wrap items-center justify-between gap-2">
                    <span className="display num text-lg">
                      {formatAmount(s.balance, s.asset.decimals)} {s.asset.symbol} <span className="text-muted">on {findChain(s.sourceChainId)?.name}</span>
                    </span>
                    <Tag tone="err">{(s.reason ?? "NO_ROUTE").replace(/_/g, " ")}</Tag>
                  </summary>
                  <ul className="mono mt-2 flex flex-col gap-1 text-[11px] text-muted">
                    {s.notes.length === 0 ? <li>No provider exposes a structural path for this asset yet.</li> : null}
                    {s.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </Module>
          ) : null}

          {atTarget.length > 0 ? (
            <div className="mono text-[11px] text-muted">
              Already at target: {atTarget.map((s) => `${formatAmount(s.balance, s.asset.decimals)} ${s.asset.symbol}`).join(", ")}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
