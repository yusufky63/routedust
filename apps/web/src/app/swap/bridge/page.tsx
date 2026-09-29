"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import {
  formatAmount,
  formatSeconds,
  gasUnitsByChain,
  nativeBalanceOf,
  nodeId,
  parseAmount,
  quoteCapabilityPath,
  rankPaths,
  scoreCandidates,
  selectBest,
  type Asset,
  type CapabilityEdge,
  type RouteCandidate,
} from "@testnet-router/core";
import { CHAINS, CHAIN_IDS, chainExit, findChain, nodeOf, officialBridgeUrl, officialBridgesBetween, officialBridgesFor } from "@testnet-router/registry";
import { RecipientField } from "@/components/destination-selector";
import { CandidateTags, GasHint, StepFlow } from "@/components/route-card";
import { SwapTabs } from "@/components/swap-tabs";
import { Button, ExternalLink, Label, LinkAction, Module, PageTitle, Rule, Select, Tag, useMounted } from "@/components/ui";
import { AssetIcon, ChainIcon } from "@/components/icons";
import { WatchSwitcher } from "@/components/watch-address";
import { useAllAssets } from "@/lib/assets";
import { withdrawalChain } from "@/lib/op-withdrawals";
import { useDiscovery } from "@/hooks/use-discovery";
import { useExecutor } from "@/hooks/use-executor";
import { useGasReserve } from "@/hooks/use-gas-reserve";
import { useScan } from "@/hooks/use-scan";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

const PCT = [25, 50, 75, 100];
/** Paths quoted per request: the shortest ones and one step longer, best structure first. */
const MAX_QUOTED_PATHS = 6;
const MAX_TOTAL_STEPS = 5;

/** Faucets that pay out a chain's gas token. */
function gasFaucets(chainId: number) {
  const chain = findChain(chainId);
  return (chain?.faucets ?? []).filter((f) => f.assetId === chain?.nativeAsset.canonicalAssetId || f.assetId === "*");
}

function byBalance(balances: Map<string, bigint>) {
  return (a: Asset, b: Asset) => {
    const x = balances.get(a.id) ?? 0n;
    const y = balances.get(b.id) ?? 0n;
    return y > x ? 1 : y < x ? -1 : 0;
  };
}

export default function BridgePage() {
  const mounted = useMounted();
  const router = useRouter();
  const discovery = useDiscovery();
  const { address, connected, watching, scan } = useScan();
  const { create } = useExecutor();
  const assets = useAllAssets();
  const settings = useRouterStore((s) => s.settings);
  const recipient = isAddress(settings.recipient) ? (settings.recipient as Address) : undefined;

  const [fromChainId, setFromChainId] = useState<number>(CHAIN_IDS.ETHEREUM_SEPOLIA);
  const [fromId, setFromId] = useState("");
  const [toChainId, setToChainId] = useState<number>(CHAIN_IDS.BASE_SEPOLIA);
  const [toId, setToId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [pickedId, setPickedId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [refresh, setRefresh] = useState(0);
  /** Quoted routes left out because they return less than half of the best one (testnet solvers can keep most of the input). */
  const [hidden, setHidden] = useState(0);
  const requestRef = useRef(0);
  /** The from-asset the destination asset was last chosen for (a new one re-picks the destination). */
  const pickedFor = useRef("");

  const graph = discovery.data?.graph;
  const budget = useMemo(() => ({ maxSwaps: settings.maxSwaps, maxBridges: settings.maxBridges, maxTotalSteps: MAX_TOTAL_STEPS }), [settings.maxSwaps, settings.maxBridges]);

  const balances = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const c of scan?.chains ?? []) for (const b of c.balances) map.set(b.asset.id, b.raw);
    return map;
  }, [scan]);

  // Unverified tokens are sold through a pool first (Swap); only verified assets travel.
  const bridgeable = useMemo(() => assets.filter((a) => a.verified), [assets]);

  /** Per asset: the destination chains it can reach and the nodes it can land as there. */
  const reach = useMemo(() => {
    const map = new Map<string, Map<number, Set<string>>>();
    if (!graph) return map;
    for (const a of bridgeable) {
      const node = nodeOf(a);
      if (!graph.hasNode(node)) continue;
      const byChain = new Map<number, Set<string>>();
      for (const n of graph.reachable(node, budget)) {
        if (n.chainId === a.chainId) continue;
        const set = byChain.get(n.chainId) ?? new Set<string>();
        set.add(nodeId(n));
        byChain.set(n.chainId, set);
      }
      if (byChain.size > 0) map.set(a.id, byChain);
    }
    return map;
  }, [graph, bridgeable, budget]);

  const fromAssets = useMemo(
    () => bridgeable.filter((a) => a.chainId === fromChainId).sort((a, b) => Number(reach.has(b.id)) - Number(reach.has(a.id)) || byBalance(balances)(a, b)),
    [bridgeable, fromChainId, reach, balances],
  );
  const from = fromAssets.find((a) => a.id === fromId);
  const fromReach = from ? reach.get(from.id) : undefined;
  const toAssets = useMemo(() => bridgeable.filter((a) => a.chainId === toChainId), [bridgeable, toChainId]);
  const to = toAssets.find((a) => a.id === toId);

  // Keep the selections valid when a chain or the edge set changes.
  useEffect(() => {
    if (fromAssets.some((a) => a.id === fromId)) return;
    const pick = fromAssets.find((a) => reach.has(a.id) && (balances.get(a.id) ?? 0n) > 0n) ?? fromAssets[0];
    setFromId(pick?.id ?? "");
  }, [fromAssets, fromId, reach, balances]);
  useEffect(() => {
    if (toChainId !== fromChainId) return;
    setToChainId(fromChainId === CHAIN_IDS.ETHEREUM_SEPOLIA ? CHAIN_IDS.BASE_SEPOLIA : CHAIN_IDS.ETHEREUM_SEPOLIA);
  }, [fromChainId, toChainId]);
  useEffect(() => {
    const valid = toAssets.some((a) => a.id === toId);
    if (valid && pickedFor.current === fromId) return;
    pickedFor.current = fromId;
    const live = (a: Asset) => Boolean(fromReach?.get(a.chainId)?.has(nodeId(nodeOf(a))));
    const same = toAssets.filter((a) => a.canonicalAssetId === from?.canonicalAssetId);
    const pick = same.find(live) ?? toAssets.find(live) ?? same[0] ?? toAssets[0];
    setToId(pick?.id ?? "");
  }, [toAssets, toId, fromId, from, fromReach]);

  const balance = from ? (balances.get(from.id) ?? 0n) : 0n;
  const nativeBalance = scan ? nativeBalanceOf(scan, fromChainId) : 0n;
  const amountIn = useMemo(() => {
    if (!from || !amountText) return 0n;
    try {
      return parseAmount(amountText, from.decimals);
    } catch {
      return 0n;
    }
  }, [amountText, from]);

  // Structural paths, ranked the way the planner ranks them; relays through a middle chain only when nothing direct exists.
  const paths = useMemo<CapabilityEdge[][]>(() => {
    if (!graph || !from || !to) return [];
    const options = { ...budget, experimentalRoutes: settings.experimentalRoutes };
    let found = graph.findPaths(nodeOf(from), nodeOf(to), options);
    if (found.length === 0) found = graph.findPaths(nodeOf(from), nodeOf(to), { ...options, allowBridgeRelay: true });
    const ranked = rankPaths(found);
    const shortest = ranked[0]?.length ?? 0;
    return ranked.filter((p) => p.length <= shortest + 1).slice(0, MAX_QUOTED_PATHS);
  }, [graph, from, to, budget, settings.experimentalRoutes]);

  // Debounced live quotes for every path; scored under the route mode from Settings.
  useEffect(() => {
    setCandidates([]);
    setPickedId(undefined);
    setError(undefined);
    setHidden(0);
    if (!from || !to || amountIn <= 0n || !address || paths.length === 0) {
      setQuoting(false);
      return;
    }
    const token = ++requestRef.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        paths.map((path) =>
          quoteCapabilityPath({
            path,
            sourceAsset: from,
            destination: nodeOf(to),
            amountIn,
            providers,
            clients: getClients(settings.rpcOverrides),
            assets,
            wallet: address,
            recipient,
            slippageBps: settings.slippageBps,
          }),
        ),
      );
      if (requestRef.current !== token) return;
      const ok = results.filter((r): r is { candidate: RouteCandidate } => "candidate" in r).map((r) => r.candidate);
      if (ok.length > 0) {
        const best = ok.reduce((m, c) => (c.amountOut > m ? c.amountOut : m), 0n);
        const kept = ok.filter((c) => c.amountOut * 2n >= best);
        const scored = scoreCandidates(kept, settings.mode, { allowWrappedOutput: settings.allowWrappedOutput });
        setHidden(ok.length - kept.length);
        setCandidates(scored);
        setPickedId(selectBest(scored)?.id);
      } else {
        setError(results.map((r) => ("error" in r ? r.error : "")).find(Boolean) ?? "no quote");
      }
      setQuoting(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [from, to, amountIn, paths, address, assets, recipient, settings.rpcOverrides, settings.slippageBps, settings.mode, settings.allowWrappedOutput, refresh]);

  const picked = candidates.find((c) => c.id === pickedId);
  // Gas kept back on the source chain: quoted units once a quote exists, the path's baseline before.
  const gasUnits = picked?.sourceGasUnits ?? (paths[0] ? (gasUnitsByChain(paths[0]).get(fromChainId) ?? 0n) : 0n);
  const reserve = useGasReserve(fromChainId, gasUnits, picked?.sourceNativeFeeWei);

  if (!mounted) return null;

  const fromChain = findChain(fromChainId);
  const toChain = findChain(toChainId);
  const isNative = from?.kind === "NATIVE";
  const spendable = isNative && reserve !== undefined ? (balance > reserve ? balance - reserve : 0n) : balance;
  const overBalance = amountIn > balance && balance > 0n;
  const eatsGas = Boolean(scan && isNative && reserve !== undefined && amountIn > 0n && amountIn <= balance && amountIn + reserve > nativeBalance);
  const gasShort = !isNative && reserve !== undefined && Boolean(scan) && nativeBalance < reserve;
  const destGasShort = Boolean(picked?.requiresDestinationGas && scan && nativeBalanceOf(scan, toChainId) === 0n);
  const canExecute = Boolean(connected && address && (!scan || scan.wallet.toLowerCase() === connected.toLowerCase()));
  const noRoute = Boolean(graph && from && to && paths.length === 0);
  const official = officialBridgesBetween(fromChainId, toChainId);
  const exit = chainExit(fromChainId);
  const rollupExit = isNative && withdrawalChain(fromChainId)?.sourceId === toChainId ? withdrawalChain(fromChainId) : undefined;

  const setPct = (p: number) => {
    if (!from) return;
    setAmountText(formatAmount((spendable * BigInt(p)) / 100n, from.decimals, { grouping: false, maxFractionDigits: 8 }));
  };
  const flip = () => {
    if (!from || !to) return;
    pickedFor.current = to.id;
    setFromChainId(to.chainId);
    setFromId(to.id);
    setToChainId(from.chainId);
    setToId(from.id);
    setAmountText("");
  };
  const execute = () => {
    if (!picked) return;
    const ex = create(picked, { recipient, origin: "bridge" });
    router.push(`/route/${ex.id}`);
  };

  const fromChainOptions = CHAINS.map((c) => {
    const out = bridgeable.filter((a) => a.chainId === c.id && reach.has(a.id)).length;
    const elsewhere = officialBridgesFor(c.id).length > 0 || Boolean(chainExit(c.id));
    return { value: c.id, label: c.name, hint: out > 0 ? `${out} can leave` : elsewhere ? "official bridge only" : graph ? "no route out" : undefined, icon: <ChainIcon chainId={c.id} size={16} /> };
  });
  const toChainOptions = CHAINS.filter((c) => c.id !== fromChainId)
    .map((c) => {
      const live = Boolean(fromReach?.get(c.id)?.size);
      const viaOfficial = officialBridgesBetween(fromChainId, c.id).length > 0;
      return { live, option: { value: c.id, label: c.name, hint: live ? "live route" : viaOfficial ? "official bridge" : graph ? "no route" : undefined, icon: <ChainIcon chainId={c.id} size={16} /> } };
    })
    .sort((a, b) => Number(b.live) - Number(a.live))
    .map((x) => x.option);
  const liveTo = (a: Asset) => Boolean(fromReach?.get(a.chainId)?.has(nodeId(nodeOf(a))));

  const blocked = !picked || quoting || !canExecute || overBalance || eatsGas || gasShort || Boolean(picked?.excludedBy);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Bridge" meta="Send any amount of an asset to another testnet through the live bridges · a swap before or after when the pair needs one · your wallet signs" />
      <div className="grid-12">
        <div className="col-span-4 md:col-span-8">
          <SwapTabs active="bridge" />
        </div>
      </div>

      {!address ? (
        <Module className="flex flex-col gap-4">
          <p className="text-sm text-muted">Connect a wallet or watch an address to load balances and quotes. Routes and official bridges show without one.</p>
          <WatchSwitcher />
        </Module>
      ) : null}

      <div className="grid-12">
        <Module className="col-span-4 flex flex-col gap-5 md:col-span-8">
          <div className="module-raised flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label>From</Label>
              <span className="mono text-xs text-muted">
                balance {from ? formatAmount(balance, from.decimals) : "—"} {from?.symbol}
              </span>
            </div>
            <Select ariaLabel="Source chain" value={fromChainId} onChange={setFromChainId} searchable className="md:w-80" options={fromChainOptions} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="num w-full border-0 bg-transparent px-0 text-3xl md:text-4xl"
                aria-label="Amount to send"
              />
              <Select
                ariaLabel="Asset to send"
                value={fromId}
                onChange={setFromId}
                disabled={fromAssets.length === 0}
                placeholder="No asset"
                align="right"
                options={fromAssets.map((a) => ({
                  value: a.id,
                  label: a.symbol,
                  hint: `${formatAmount(balances.get(a.id) ?? 0n, a.decimals)}${graph && !reach.has(a.id) ? " · no route" : ""}`,
                  icon: <AssetIcon asset={a} size={16} />,
                }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {PCT.map((p) => (
                <button key={p} type="button" className="btn btn-sm" disabled={spendable === 0n || !from} onClick={() => setPct(p)}>
                  {p === 100 ? "MAX" : `${p}%`}
                </button>
              ))}
              {isNative && reserve !== undefined ? (
                <span className="mono ml-2 text-xs text-muted">
                  keeps ≈ {formatAmount(reserve, 18, { maxFractionDigits: 6 })} {fromChain?.nativeAsset.symbol} for gas
                </span>
              ) : null}
              {overBalance ? <span className="mono ml-2 text-xs text-warning">amount exceeds balance</span> : null}
              {eatsGas ? (
                <span className="mono ml-2 text-xs text-warning">
                  leaves too little for gas: at most {formatAmount(spendable, from?.decimals ?? 18, { maxFractionDigits: 6 })} {from?.symbol}
                </span>
              ) : null}
            </div>
          </div>

          <div className="-my-2 flex justify-center">
            <button type="button" onClick={flip} disabled={!from || !to} className="btn btn-sm rounded-full" title="Reverse direction" aria-label="Reverse direction">
              ⇅
            </button>
          </div>

          <div className="module-raised flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label>To</Label>
              {picked ? <Tag tone="ok">LIVE QUOTE</Tag> : quoting ? <Tag>QUOTING</Tag> : null}
            </div>
            <Select ariaLabel="Destination chain" value={toChainId} onChange={setToChainId} searchable className="md:w-80" options={toChainOptions} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
              <div className={`display num text-3xl leading-none md:text-4xl ${quoting ? "text-muted" : ""}`}>{picked ? formatAmount(picked.amountOut, to?.decimals ?? 18) : quoting ? "…" : "0.0"}</div>
              <Select
                ariaLabel="Asset to receive"
                value={toId}
                onChange={setToId}
                disabled={toAssets.length === 0}
                placeholder="No asset"
                align="right"
                options={toAssets.map((a) => ({ value: a.id, label: a.symbol, hint: graph ? (liveTo(a) ? "live route" : "no route") : undefined, icon: <AssetIcon asset={a} size={16} /> }))}
              />
            </div>
          </div>

          <RecipientField />

          {discovery.isLoading ? <p className="mono text-xs text-muted">discovering live bridges…</p> : null}

          {noRoute ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Tag tone="err">NO LIVE ROUTE</Tag>
              <p className="text-sm text-muted">
                No live bridge connects {from?.symbol} on {fromChain?.name} to {to?.symbol} on {toChain?.name}
                {settings.maxBridges < 2 || settings.maxSwaps < 2 ? " within the hop limits in Settings" : ""}.
                {official.length > 0 || rollupExit ? " The chain's own bridge can still do it:" : fromReach && fromReach.size > 0 ? " Pick a destination marked “live route”." : ""}
              </p>
            </div>
          ) : null}

          {candidates.length > 0 || error ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              {error ? <Tag tone="err">{error.slice(0, 100)}</Tag> : null}
              {candidates.length > 1 ? <Label>Routes / {String(candidates.length).padStart(2, "0")}</Label> : null}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedId(c.id)}
                  disabled={Boolean(c.excludedBy)}
                  aria-pressed={c.id === picked?.id}
                  className={`module-raised module-interactive flex w-full flex-col gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${c.id === picked?.id ? "module-selected" : ""}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-3">
                    <StepFlow candidate={c} dense />
                    <span className="display num text-lg">
                      {formatAmount(c.amountOut, to?.decimals ?? 18)} <span className="text-sm text-muted">{to?.symbol}</span>
                    </span>
                  </span>
                  <CandidateTags candidate={c} />
                </button>
              ))}
              {picked ? (
                <dl className="mono grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted md:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt>min received</dt>
                    <dd className="num text-text">
                      {formatAmount(picked.minAmountOut, to?.decimals ?? 18)} {to?.symbol}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>arrives in about</dt>
                    <dd className="text-text">{formatSeconds(picked.estimatedSeconds)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>gas kept on {fromChain?.shortName}</dt>
                    <dd className="num text-text">{reserve !== undefined ? `≈ ${formatAmount(reserve, 18, { maxFractionDigits: 6 })} ${fromChain?.nativeAsset.symbol}` : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>lands at</dt>
                    <dd className="text-text">{recipient ? `${recipient.slice(0, 6)}…${recipient.slice(-4)}` : "your wallet"}</dd>
                  </div>
                  {picked.priceImpactBps !== undefined && picked.priceImpactBps > settings.maxPriceImpactBps ? (
                    <div className="col-span-full text-error">above your {settings.maxPriceImpactBps / 100}% impact limit: send less or accept the loss</div>
                  ) : null}
                  {gasShort && reserve !== undefined ? (
                    <div className="col-span-full">
                      <GasHint chainId={fromChainId} shortfall={reserve - nativeBalance} role="source" faucets={gasFaucets(fromChainId)} />
                    </div>
                  ) : null}
                  {destGasShort ? (
                    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-warning">
                      <span>
                        the last step is a transaction you sign on {toChain?.shortName}, and this wallet has no {toChain?.nativeAsset.symbol} there
                      </span>
                      {gasFaucets(toChainId)
                        .slice(0, 2)
                        .map((f) => (
                          <ExternalLink key={f.id} href={f.url}>
                            {f.name}
                          </ExternalLink>
                        ))}
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <LinkAction className="self-start" onClick={() => setRefresh((n) => n + 1)} disabled={quoting}>
                Refresh quotes ↻
              </LinkAction>
              {hidden > 0 ? <span className="mono text-xs text-muted">{hidden} more route{hidden === 1 ? "" : "s"} returning less than half of the best one hidden</span> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button variant="solid" onClick={execute} disabled={blocked} className="btn-lg">
              {from && to && toChain ? `Send ${from.symbol} → ${to.symbol} on ${toChain.shortName}` : "Send"}
            </Button>
            {!canExecute && address ? <span className="mono text-xs text-muted">{watching ? "watching: connect this wallet to execute" : "connect the wallet that holds the balance"}</span> : null}
          </div>
        </Module>

        <div className="col-span-4 flex flex-col gap-4 md:col-span-4">
          {official.length > 0 || rollupExit || exit ? (
            <Module className={`flex flex-col gap-3 ${noRoute ? "module-selected" : ""}`}>
              <Label>{official.length > 0 && official.every((b) => !b.firstParty) ? "Recommended bridge" : "Official bridge"}</Label>
              {official.map((b) => (
                <div key={b.id} className="flex flex-col gap-1">
                  <ExternalLink href={officialBridgeUrl(b, fromChainId, toChainId)} className="text-sm">
                    {b.name}
                  </ExternalLink>
                  <p className="text-xs text-muted">
                    {b.note}
                    {b.firstParty ? "" : ` Run by a third party; ${findChain(b.chainId)?.name}'s docs point to it.`}
                  </p>
                </div>
              ))}
              {rollupExit ? (
                <p className="text-xs text-muted">
                  RouteDust can also do the canonical withdrawal itself: start it, prove it and finalise it in{" "}
                  <Link href="/activity" className="underline underline-offset-2">
                    Activity
                  </Link>
                  .
                </p>
              ) : null}
              {exit && official.length === 0 ? (
                <div className="flex flex-col gap-1">
                  <ExternalLink href={exit.url} className="text-sm">
                    {exit.name}
                  </ExternalLink>
                  <p className="text-xs text-muted">{exit.note}</p>
                </div>
              ) : null}
            </Module>
          ) : null}

          <Module className="flex flex-col gap-3">
            <Label>What this does</Label>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>Moves an asset to another testnet through every live bridge RouteDust found (Circle CCTP and Gateway, Across, OP Standard Bridge, Hyperlane, Stargate, LI.FI), with a swap before or after when the pair needs one.</li>
              <li>Send any part of a balance: a percentage or your own number. For the gas token, the network fee is kept back.</li>
              <li>Every route listed has a live quote; the best one for your route mode is preselected and the others are one click away.</li>
              <li>Chains with no live route show their own bridge instead. Same-chain trades live in Swap.</li>
            </ul>
            <Rule />
            <div className="mono text-xs text-muted">
              {discovery.data ? `${fromReach?.size ?? 0} chains reachable from ${from?.symbol ?? "—"} on ${fromChain?.shortName}` : "no discovery yet"}
            </div>
          </Module>
        </div>
      </div>
    </div>
  );
}
