"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MODE_LABELS, formatAmount, shortAddress, type RouteCandidate, type SourcePlan } from "@testnet-router/core";
import { CHAINS, findChain } from "@testnet-router/registry";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { DestinationSelector } from "@/components/destination-selector";
import { ModeSelector } from "@/components/mode-selector";
import { RouteCard } from "@/components/route-card";
import { Button, ExternalLink, Marker, Tag, useMounted } from "@/components/ui";
import { WatchAddressForm } from "@/components/watch-address";
import { useDiscovery } from "@/hooks/use-discovery";
import { useExecutor } from "@/hooks/use-executor";
import { usePlan } from "@/hooks/use-plan";
import { useRouteAmounts } from "@/hooks/use-route-amounts";
import { useScan } from "@/hooks/use-scan";
import { pad2 } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

function StepHeading({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="mono text-xs text-muted">{pad2(n)}</span>
        <span className="display text-sm uppercase tracking-[0.12em]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ title, count, hint, right }: { title: string; count: number; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3 pt-8 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="display text-xl uppercase tracking-[0.04em]">
          {title} <span className="text-muted">/ {pad2(count)}</span>
        </h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

function Landing() {
  return (
    <div className="flex flex-col gap-10 py-12">
      <div className="max-w-3xl">
        <h1 className="display text-3xl leading-tight md:text-5xl">Route fragmented testnet balances into the exact chain and asset you want.</h1>
        <p className="mt-5 max-w-2xl text-sm text-muted md:text-base">
          The router scans a wallet across {CHAINS.length} testnets, reserves gas on every source chain, quotes and simulates every path, and never
          manufactures a route from protocol support alone. When nothing is executable it says so.
        </p>
      </div>
      <div className="grid-12">
        <section className="module col-span-4 flex flex-col gap-5 !p-6 md:col-span-6">
          <StepHeading n={1} title="Connect a wallet" />
          <p className="text-sm text-muted">Use the Connect button in the header. Every transaction is signed in your wallet; nothing leaves the browser.</p>
        </section>
        <section className="module col-span-4 flex flex-col gap-5 !p-6 md:col-span-6">
          <StepHeading n={1} title="Or watch an address" />
          <p className="text-sm text-muted">Scan and plan for any address without connecting. Execution stays disabled until that wallet is connected.</p>
          <WatchAddressForm />
        </section>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tag tone="accent">CIRCLE CCTP</Tag>
        <Tag>UNISWAP V3</Tag>
        <Tag>ACROSS TESTNET</Tag>
        <Tag>OP STANDARD BRIDGE</Tag>
        <Tag>NATIVE ≠ ETH</Tag>
        <Link href="/faucets" className="tag hover:text-text">
          FAUCET CENTER ↗
        </Link>
      </div>
    </div>
  );
}

const NO_ROUTE_HINT: Record<string, string> = {
  NO_LIQUIDITY: "A DEX or relayer exists but returned no usable quote for this amount.",
  NO_BRIDGE_FOR_ASSET: "No provider exposes an asset-level route for this token yet.",
  NO_STRUCTURAL_PATH: "No chain of live edges connects this asset to the target.",
  AMOUNT_BELOW_MINIMUM: "Dust below the provider minimum.",
  PROVIDER_UNAVAILABLE: "Provider API unavailable at quote time.",
  OUTPUT_IS_WRAPPED_AND_BLOCKED: "Only wrapped outputs exist; enable wrapped outputs in settings to allow them.",
  UNVERIFIED_ASSET: "Token identity is not verified.",
  INSUFFICIENT_SOURCE_GAS: "Another chain on the path needs gas.",
};

function NoRouteRow({ source }: { source: SourcePlan }) {
  const chain = findChain(source.sourceChainId);
  return (
    <details className="border-b border-border py-4">
      <summary className="grid grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1.4fr_1fr_auto]">
        <div className="display num text-lg">
          {formatAmount(source.balance, source.asset.decimals)} {source.asset.symbol}
          <span className="ml-3 text-sm text-muted">
            <Marker color={chain?.color} /> {chain?.name}
          </span>
        </div>
        <div className="hidden text-sm text-muted md:block">{NO_ROUTE_HINT[source.reason ?? ""] ?? "No provider returned a live path."}</div>
        <Tag tone="err">{(source.reason ?? "NO_ROUTE").replace(/_/g, " ")}</Tag>
      </summary>
      <ul className="mono mt-3 flex flex-col gap-1 pl-1 text-[11px] text-muted">
        <li className="md:hidden">{NO_ROUTE_HINT[source.reason ?? ""] ?? "No provider returned a live path."}</li>
        {source.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </details>
  );
}

export default function RouterPage() {
  const mounted = useMounted();
  const router = useRouter();
  const discovery = useDiscovery();
  const { address, connected, watching, scan, scanning, progress, tokenProgress, rescan } = useScan();
  const { plan, planning, progress: planProgress, error, runPlan, setMode } = usePlan(scan, discovery.data);
  const { create } = useExecutor();
  const amounts = useRouteAmounts(plan, address);
  const settings = useRouterStore((s) => s.settings);
  const setSettings = useRouterStore((s) => s.setSettings);
  const setWatchAddress = useRouterStore((s) => s.setWatchAddress);
  const createBatch = useRouterStore((s) => s.createBatch);
  const autoPlanned = useRef<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Plan automatically once per scan + destination; re-planning afterwards is explicit.
  useEffect(() => {
    if (!scan || !discovery.data || planning) return;
    const key = `${scan.scannedAt}:${settings.destinationAssetId}`;
    if (autoPlanned.current === key) return;
    autoPlanned.current = key;
    void runPlan();
  }, [scan, discovery.data, planning, runPlan, settings.destinationAssetId]);

  // A new plan clears the selection.
  useEffect(() => setSelected(new Set()), [plan?.id]);

  const routable = useMemo(() => plan?.sources.filter((s) => s.status === "ROUTABLE" || s.status === "PARTIAL") ?? [], [plan]);
  const needGas = plan?.sources.filter((s) => s.status === "NEED_GAS") ?? [];
  const noRoute = plan?.sources.filter((s) => s.status === "NO_ROUTE") ?? [];
  const atTarget = plan?.sources.filter((s) => s.status === "TARGET") ?? [];
  const destAsset = findAsset(settings.destinationAssetId);

  const networks = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const s of routable) map.set(s.sourceChainId, [...(map.get(s.sourceChainId) ?? []), s.id]);
    return [...map.entries()].map(([chainId, ids]) => ({ chainId, ids, allSelected: ids.every((id) => selected.has(id)) }));
  }, [routable, selected]);

  if (!mounted) return null;
  if (!address) return <Landing />;

  const busy = scanning || planning || discovery.isLoading;
  const canExecute = Boolean(connected && scan && scan.wallet.toLowerCase() === connected.toLowerCase());
  const executeHint = canExecute ? undefined : "connect this wallet to execute";
  const foundAssets = scan ? scan.chains.flatMap((c) => c.balances.filter((b) => b.raw > 0n)).length : 0;
  const foundNetworks = scan ? scan.chains.filter((c) => c.balances.some((b) => b.raw > 0n)).length : 0;

  const selectedSources = routable.filter((s) => selected.has(s.id));
  const selectedCandidates = selectedSources.map((s) => amounts.effective(s));
  const selectionReady = selectedSources.length > 0 && selectedCandidates.every((c) => Boolean(c)) && selectedSources.every((s) => !amounts.state[s.id]?.quoting);
  const selectionOut = selectedCandidates.reduce((acc, c) => acc + (c?.amountOut ?? 0n), 0n);
  const expectedOut = routable.reduce((acc, s) => acc + (amounts.effective(s)?.amountOut ?? 0n), 0n);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const execute = (candidate: RouteCandidate) => {
    const ex = create(candidate);
    router.push(`/route/${ex.id}`);
  };

  const executeSelected = () => {
    if (!selectionReady) return;
    const ids = selectedSources.map((s) => create(amounts.effective(s) as RouteCandidate).id);
    const batch = createBatch(ids, `${ids.length} routes → ${findChain(settings.destinationAssetId.split(":")[0] ? Number(settings.destinationAssetId.split(":")[0]) : 0)?.shortName ?? ""} ${destAsset?.symbol ?? ""}`);
    router.push(`/batch/${batch.id}`);
  };

  return (
    <div className="flex flex-col gap-4 py-6 pb-32">
      <div className="grid-12">
        <section className="module col-span-4 flex flex-col gap-6 !p-6 md:col-span-5">
          <StepHeading n={1} title={watching ? "Watching" : "Wallet"}>
            <Button onClick={() => void rescan()} disabled={scanning}>
              {scanning ? (progress.length === 0 && tokenProgress.length > 0 ? `Tokens ${tokenProgress.length}/${CHAINS.filter((c) => c.tokenIndexer).length}` : `Scanning ${progress.length}/${CHAINS.length}`) : "Rescan"}
            </Button>
          </StepHeading>
          <div>
            <div className="display num text-2xl md:text-3xl">{shortAddress(address, 6)}</div>
            <div className="mono mt-2 text-[11px] text-muted">
              {scan ? `scanned ${new Date(scan.scannedAt).toLocaleTimeString()} · ${scan.chains.filter((c) => c.ok).length}/${CHAINS.length} RPCs answered` : scanning ? "scanning…" : "no scan yet"}
              {watching ? (
                <>
                  {" · "}
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setWatchAddress(undefined)}>
                    stop watching
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5">
            <div>
              <div className="display num text-3xl leading-none">{pad2(foundNetworks)}</div>
              <div className="label mt-2">networks with balance</div>
            </div>
            <div>
              <div className="display num text-3xl leading-none">{pad2(foundAssets)}</div>
              <div className="label mt-2">assets found</div>
            </div>
          </div>
          <Link href="/balances" className="mono self-start border-b border-transparent text-[11px] uppercase tracking-[0.08em] text-muted hover:border-text hover:text-text">
            Full balance matrix →
          </Link>
        </section>

        <section className="module col-span-4 flex flex-col gap-6 !p-6 md:col-span-7">
          <StepHeading n={2} title="Target" />
          <DestinationSelector assetId={settings.destinationAssetId} onChange={(id) => setSettings({ destinationAssetId: id })} disabled={planning} />
        </section>
      </div>

      <section className="module flex flex-col gap-6 !p-6">
        <StepHeading n={3} title="Route mode" />
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <ModeSelector mode={settings.mode} onChange={setMode} disabled={planning} />
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <Button variant="solid" onClick={() => void runPlan()} disabled={busy || !scan || !discovery.data} className="!px-6 !py-3">
              {planning ? "Planning…" : plan ? "Re-plan" : "Plan routes"}
            </Button>
            <span className="mono text-[11px] text-muted md:text-right">
              {discovery.isLoading
                ? "discovering live capabilities…"
                : planning && planProgress
                  ? `${planProgress.completed ?? 0}/${planProgress.total ?? 0} balances quoted`
                  : discovery.data
                    ? `${discovery.data.graph.size} live edges · ${discovery.data.summaries.filter((s) => s.ok).length}/${discovery.data.summaries.length} providers`
                    : "discovery failed"}
            </span>
            {error ? <span className="mono text-[11px] text-error">{error}</span> : null}
          </div>
        </div>
      </section>

      {plan ? (
        <div className="module-raised grid grid-cols-2 gap-6 !p-6 md:grid-cols-6">
          <div>
            <div className="display num text-3xl leading-none text-success">{pad2(routable.length)}</div>
            <div className="label mt-2">routable</div>
          </div>
          <div>
            <div className={`display num text-3xl leading-none ${needGas.length ? "text-warning" : ""}`}>{pad2(needGas.length)}</div>
            <div className="label mt-2">need gas</div>
          </div>
          <div>
            <div className={`display num text-3xl leading-none ${noRoute.length ? "text-error" : ""}`}>{pad2(noRoute.length)}</div>
            <div className="label mt-2">no route</div>
          </div>
          <div>
            <div className="display num text-3xl leading-none">{pad2(atTarget.length)}</div>
            <div className="label mt-2">already at target</div>
          </div>
          <div className="col-span-2 md:text-right">
            <div className="display num whitespace-nowrap text-3xl leading-none">
              {formatAmount(expectedOut, destAsset?.decimals ?? 6, { maxFractionDigits: 2 })} <span className="text-lg text-muted">{destAsset?.symbol}</span>
            </div>
            <div className="label mt-2">total expected on target</div>
          </div>
        </div>
      ) : null}

      {plan ? (
        <>
          <SectionHeading
            title="Routes"
            count={routable.length}
            hint={`One route per source balance, ranked by ${MODE_LABELS[plan.mode]}. Multi-hop detours are tried when no direct path quotes; PARTIAL routes move what a capped provider can take now. Adjust amounts, tick routes, execute one by one or as a batch.`}
            right={<Tag tone="accent">{MODE_LABELS[plan.mode].toUpperCase()}</Tag>}
          />

          {routable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label mr-1">Select</span>
              <button type="button" className={`btn !px-2.5 !py-1 ${selected.size === routable.length ? "btn-active" : ""}`} onClick={() => toggleMany(routable.map((s) => s.id), selected.size !== routable.length)}>
                All ({routable.length})
              </button>
              {networks.map((n) => {
                const chain = findChain(n.chainId);
                return (
                  <button
                    key={n.chainId}
                    type="button"
                    className={`btn flex items-center gap-1.5 !px-2.5 !py-1 ${n.allSelected ? "btn-active" : ""}`}
                    onClick={() => toggleMany(n.ids, !n.allSelected)}
                    title={`Select every route from ${chain?.name}`}
                  >
                    <Marker color={chain?.color} /> {chain?.shortName} ({n.ids.length})
                  </button>
                );
              })}
              {selected.size > 0 ? (
                <button type="button" className="mono ml-2 border-b border-transparent text-[11px] uppercase tracking-[0.08em] text-muted hover:border-text hover:text-text" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          {routable.length === 0 ? (
            <div className="module !p-8 text-center">
              <div className="display text-lg">NO EXECUTABLE ROUTE</div>
              <p className="mt-2 text-sm text-muted">No source balance has a live, gas-covered path to the target right now. See below for why.</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {routable.map((s, i) => (
              <RouteCard
                key={s.id}
                index={i + 1}
                source={s}
                checked={selected.has(s.id)}
                onToggle={() => toggle(s.id)}
                amountState={amounts.state[s.id]}
                onAmountChange={(amount, pct) => amounts.setAmount(s, amount, pct)}
                onAmountReset={() => amounts.reset(s.id)}
                onExecute={execute}
                disabled={busy}
                canExecute={canExecute}
                executeHint={executeHint}
              />
            ))}
          </div>

          {needGas.length > 0 ? (
            <>
              <SectionHeading title="Source gas required" count={needGas.length} hint="These balances have a path, but the source chain cannot pay for it. Faucets open externally." />
              <div className="flex flex-col">
                {needGas.map((s) => {
                  const chain = findChain(s.sourceChainId);
                  return (
                    <div key={s.id} className="flex flex-col gap-3 border-b border-border py-5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="display num text-lg">
                          {formatAmount(s.balance, s.asset.decimals)} {s.asset.symbol}
                          <span className="ml-3 text-sm text-muted">
                            <Marker color={chain?.color} /> {chain?.name}
                          </span>
                        </div>
                        <div className="mono mt-1 text-[11px] text-warning">
                          need approximately {formatAmount(s.gas.shortfall > 0n ? s.gas.shortfall : s.gas.reserve, 18)} {chain?.nativeAsset.symbol} for route gas
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {s.faucets.slice(0, 3).map((f) => (
                          <ExternalLink key={f.id} href={f.url}>
                            {f.name}
                          </ExternalLink>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {noRoute.length > 0 ? (
            <>
              <SectionHeading title="No route" count={noRoute.length} hint="A valid answer. Expand a row to see what each provider replied." />
              <div className="flex flex-col">
                {noRoute
                  .filter((s) => s.asset.verified)
                  .map((s) => (
                    <NoRouteRow key={s.id} source={s} />
                  ))}
                {noRoute.some((s) => !s.asset.verified) ? (
                  <details className="border-b border-border py-4">
                    <summary className="flex flex-wrap items-center justify-between gap-3">
                      <span className="display text-lg">
                        {pad2(noRoute.filter((s) => !s.asset.verified).length)} <span className="text-sm text-muted">unverified tokens without a live DEX pool</span>
                      </span>
                      <Tag tone="muted">NO LIQUIDITY</Tag>
                    </summary>
                    <ul className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                      {noRoute
                        .filter((s) => !s.asset.verified)
                        .map((s) => (
                          <li key={s.id} title={s.asset.address}>
                            {formatAmount(s.balance, s.asset.decimals)} {s.asset.symbol} · {findChain(s.sourceChainId)?.shortName}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </>
          ) : null}

          {atTarget.length > 0 ? (
            <p className="mono pt-6 text-[11px] text-muted">
              Already on the target: {atTarget.map((s) => `${formatAmount(s.balance, s.asset.decimals)} ${s.asset.symbol}`).join(", ")}
            </p>
          ) : null}
        </>
      ) : null}

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="display num text-xl">
                {pad2(selected.size)} <span className="text-sm text-muted">routes selected</span>
              </span>
              <span className="display num text-xl">
                {formatAmount(selectionOut, destAsset?.decimals ?? 6, { maxFractionDigits: 4 })} <span className="text-sm text-muted">{destAsset?.symbol} expected</span>
              </span>
              <span className="mono text-[11px] text-muted">
                {selectedSources.reduce((n, s) => n + (amounts.effective(s)?.txCount ?? 0), 0)} transactions · runs one route after another
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!canExecute ? <span className="mono text-[11px] text-muted">{executeHint}</span> : null}
              <Button variant="solid" onClick={executeSelected} disabled={!selectionReady || !canExecute || busy} className="!px-6 !py-3">
                Execute selected
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
