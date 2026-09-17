"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatAmount,
  parseAmount,
  quoteCapabilityPath,
  type Asset,
  type CapabilityEdge,
  type RouteCandidate,
} from "@testnet-router/core";
import { CHAINS, nodeOf } from "@testnet-router/registry";
import type { Address } from "viem";
import { CustomTokenForm } from "@/components/destination-selector";
import { Button, Label, Module, PageTitle, Rule, Select, Tag, useMounted } from "@/components/ui";
import { PriceHistory } from "@/components/price-history";
import { AssetIcon, ChainIcon } from "@/components/icons";
import { WatchAddressForm } from "@/components/watch-address";
import { useAllAssets } from "@/lib/assets";
import { useDiscovery } from "@/hooks/use-discovery";
import { useExecutor } from "@/hooks/use-executor";
import { useScan } from "@/hooks/use-scan";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

const PCT = [25, 50, 75, 100];

export default function SwapPage() {
  const mounted = useMounted();
  const router = useRouter();
  const discovery = useDiscovery();
  const { address, connected, watching, scan } = useScan();
  const { create } = useExecutor();
  const assets = useAllAssets();
  const settings = useRouterStore((s) => s.settings);
  const unverifiedTokens = settings.unverifiedTokens;

  const [chainId, setChainId] = useState<number>(CHAINS[0]?.id ?? 11155111);
  const [payId, setPayId] = useState<string>("");
  const [receiveId, setReceiveId] = useState<string>("");
  const [amountText, setAmountText] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<RouteCandidate | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const requestRef = useRef(0);

  const chain = CHAINS.find((c) => c.id === chainId);
  const chainAssets = useMemo(() => assets.filter((a) => a.chainId === chainId), [assets, chainId]);
  const balances = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const c of scan?.chains ?? []) for (const b of c.balances) map.set(b.asset.id, b.raw);
    return map;
  }, [scan]);

  // Assets that have at least one live swap edge on this chain, from the running discovery.
  const swapEdges = useMemo(() => (discovery.data?.edges ?? []).filter((e) => e.type === "SWAP" && e.from.chainId === chainId), [discovery.data, chainId]);
  const payables = useMemo(() => {
    const ids = new Set(swapEdges.map((e) => e.from.assetId));
    return chainAssets
      .filter((a) => ids.has(a.id))
      .sort((a, b) => {
        const ba = balances.get(a.id) ?? 0n;
        const bb = balances.get(b.id) ?? 0n;
        return bb > ba ? 1 : bb < ba ? -1 : 0;
      });
  }, [chainAssets, swapEdges, balances]);
  const receivables = useMemo(() => {
    const ids = new Set(swapEdges.map((e) => e.to.assetId));
    return chainAssets.filter((a) => ids.has(a.id));
  }, [chainAssets, swapEdges]);

  // Keep selections valid when the chain or the edge set changes.
  useEffect(() => {
    if (!payables.some((a) => a.id === payId)) setPayId(payables[0]?.id ?? "");
  }, [payables, payId]);
  useEffect(() => {
    const options = receivables.filter((a) => a.id !== payId);
    if (!options.some((a) => a.id === receiveId)) setReceiveId(options.find((a) => a.canonicalAssetId === "USDC")?.id ?? options[0]?.id ?? "");
  }, [receivables, receiveId, payId]);

  const pay = chainAssets.find((a) => a.id === payId);
  const receive = chainAssets.find((a) => a.id === receiveId);
  const balance = pay ? (balances.get(pay.id) ?? 0n) : 0n;
  const amountIn = useMemo(() => {
    if (!pay || !amountText) return 0n;
    try {
      return parseAmount(amountText, pay.decimals);
    } catch {
      return 0n;
    }
  }, [amountText, pay]);

  // Structural paths: direct edge, or two hops (token -> native -> USDC style), same chain only.
  const paths = useMemo<CapabilityEdge[][]>(() => {
    if (!pay || !receive || !discovery.data) return [];
    return discovery.data.graph.findPaths(nodeOf(pay), nodeOf(receive), { maxSwaps: 2, maxBridges: 0, maxTotalSteps: 2, experimentalRoutes: false });
  }, [pay, receive, discovery.data]);

  // Debounced live quote across every path; best output wins.
  useEffect(() => {
    setQuote(undefined);
    setError(undefined);
    if (!pay || !receive || amountIn <= 0n || !address) return;
    if (paths.length === 0) {
      setError("No live Uniswap pool connects these two on this chain.");
      return;
    }
    const token = ++requestRef.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        paths.map((path) =>
          quoteCapabilityPath({
            path,
            sourceAsset: pay,
            destination: nodeOf(receive),
            amountIn,
            providers,
            clients: getClients(settings.rpcOverrides),
            assets,
            wallet: address,
            slippageBps: settings.slippageBps,
          }),
        ),
      );
      if (requestRef.current !== token) return;
      const ok = results.filter((r): r is { candidate: RouteCandidate } => "candidate" in r).map((r) => r.candidate);
      const best = ok.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0))[0];
      if (best) setQuote(best);
      else setError(results.map((r) => ("error" in r ? r.error : "")).filter(Boolean)[0] ?? "no quote");
      setQuoting(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [pay, receive, amountIn, paths, address, assets, settings.rpcOverrides, settings.slippageBps]);

  if (!mounted) return null;

  const canExecute = Boolean(connected && address && (!scan || scan.wallet.toLowerCase() === connected.toLowerCase()));
  const overBalance = amountIn > balance && balance > 0n;
  const impact = quote?.priceImpactBps;

  const execute = () => {
    if (!quote) return;
    const ex = create(quote);
    router.push(`/route/${ex.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Swap" meta="Same-chain buy / sell on Uniswap v3 · live quotes with price impact · your wallet signs, no intermediary">
        <Link href="/liquidity" className="btn">
          Liquidity
        </Link>
        <Link href="/" className="btn">
          Cross-chain router →
        </Link>
      </PageTitle>

      {!address ? (
        <Module className="flex flex-col gap-4">
          <p className="text-sm text-muted">Connect a wallet or watch an address to load balances and quotes.</p>
          <WatchAddressForm />
        </Module>
      ) : null}

      <div className="grid-12">
        <Module className="col-span-4 flex flex-col gap-5 !p-6 md:col-span-8">
          <div className="flex flex-col gap-1 md:w-72">
            <Label>Chain</Label>
            <Select
              ariaLabel="Chain"
              value={chainId}
              onChange={setChainId}
              searchable
              options={CHAINS.map((c) => {
                const live = (discovery.data?.edges ?? []).some((e) => e.type === "SWAP" && e.from.chainId === c.id);
                return { value: c.id, label: c.name, hint: live ? "live pools" : "no live pool", disabled: !live, icon: <ChainIcon chainId={c.id} size={16} /> };
              })}
            />
            {discovery.isLoading ? <span className="mono text-[11px] text-muted">discovering live pools…</span> : null}
          </div>

          <Rule />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr] md:items-start">
            <div className="flex flex-col gap-3">
              <Label>You pay</Label>
              <Select
                ariaLabel="Asset to sell"
                value={payId}
                onChange={setPayId}
                disabled={payables.length === 0}
                placeholder="No sellable asset"
                options={payables.map((a) => ({ value: a.id, label: a.symbol, hint: `${formatAmount(balances.get(a.id) ?? 0n, a.decimals)}${a.verified ? "" : " · unverified"}`, icon: <AssetIcon asset={a} size={16} /> }))}
              />
              <div className="flex items-center gap-2">
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  className="num w-full !text-lg"
                  aria-label="Amount to sell"
                />
                <span className="mono text-xs text-muted">{pay?.symbol}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {PCT.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn !px-2.5 !py-1"
                    disabled={balance === 0n || !pay}
                    onClick={() => pay && setAmountText(formatAmount((balance * BigInt(p)) / 100n, pay.decimals, { grouping: false, maxFractionDigits: 8 }))}
                  >
                    {p === 100 ? "MAX" : `${p}%`}
                  </button>
                ))}
                <span className="mono ml-2 text-[11px] text-muted">
                  balance {pay ? formatAmount(balance, pay.decimals) : "—"} {pay?.symbol}
                </span>
              </div>
              {overBalance ? <span className="mono text-[11px] text-warning">amount exceeds balance</span> : null}
            </div>

            <div className="mono hidden pt-12 text-lg text-muted md:block" aria-hidden>
              ⟶
            </div>

            <div className="flex flex-col gap-3">
              <Label>You receive</Label>
              <Select
                ariaLabel="Asset to buy"
                value={receiveId}
                onChange={setReceiveId}
                disabled={receivables.length === 0}
                placeholder="No buyable asset"
                options={receivables.filter((a) => a.id !== payId).map((a) => ({ value: a.id, label: a.symbol, hint: a.verified ? undefined : "unverified", icon: <AssetIcon asset={a} size={16} /> }))}
              />
              <div className={`display num text-3xl leading-none ${quoting ? "text-muted" : ""}`}>
                {quote ? formatAmount(quote.amountOut, receive?.decimals ?? 18) : quoting ? "…" : "—"} <span className="text-lg text-muted">{receive?.symbol}</span>
              </div>
              {unverifiedTokens ? (
                <button
                  type="button"
                  onClick={() => setShowCustom(!showCustom)}
                  className={`mono self-start border-b text-[11px] uppercase tracking-[0.08em] ${showCustom ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
                >
                  Buy a token by address…
                </button>
              ) : null}
            </div>
          </div>

          {showCustom && unverifiedTokens ? (
            <CustomTokenForm
              fixedChainId={chainId}
              label={`Add a token on ${chain?.name}`}
              onAdded={(a) => {
                setReceiveId(a.id);
                setShowCustom(false);
              }}
            />
          ) : null}

          <Rule />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {quote ? (
                <>
                  <Tag tone="ok">LIVE QUOTE</Tag>
                  <Tag>{quote.txCount} TX</Tag>
                  {impact !== undefined ? <Tag tone={impact > 500 ? "err" : impact > 100 ? "warn" : "muted"}>IMPACT {(impact / 100).toFixed(2)}%</Tag> : null}
                  {pay && !pay.verified ? <Tag tone="warn">UNVERIFIED TOKEN</Tag> : null}
                  {receive && !receive.verified ? <Tag tone="warn">BUY UNVERIFIED</Tag> : null}
                </>
              ) : null}
              {error ? <Tag tone="err">{error.slice(0, 80)}</Tag> : null}
            </div>
            {quote ? (
              <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
                <span>
                  min received {formatAmount(quote.minAmountOut, receive?.decimals ?? 18)} {receive?.symbol} (slippage {settings.slippageBps / 100}%)
                </span>
                <span>{quote.edges.map((e) => e.healthNote).join(" → ")}</span>
                {impact !== undefined && impact > settings.maxPriceImpactBps ? (
                  <span className="text-error">above your {settings.maxPriceImpactBps / 100}% impact limit: sell less or accept the loss</span>
                ) : null}
              </div>
            ) : null}
            {quote && pay?.address !== undefined && receive?.address !== undefined && quote.edges.length === 1 && quote.edges[0]?.provider === "uniswap" && (quote.edges[0]?.quote.raw as { pool?: Address } | undefined)?.pool ? (
              <PriceHistory
                chainId={chainId}
                pool={(quote.edges[0]?.quote.raw as { pool: Address }).pool}
                decimals0={pay.address.toLowerCase() < receive.address.toLowerCase() ? pay.decimals : receive.decimals}
                decimals1={pay.address.toLowerCase() < receive.address.toLowerCase() ? receive.decimals : pay.decimals}
                invert={!(pay.address.toLowerCase() < receive.address.toLowerCase())}
                label={`${receive.symbol} per ${pay.symbol}`}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="solid" onClick={execute} disabled={!quote || quoting || !canExecute || overBalance}>
                {pay && receive ? `Swap ${pay.symbol} → ${receive.symbol}` : "Swap"}
              </Button>
              {!canExecute && address ? <span className="mono text-[11px] text-muted">{watching ? "watching: connect this wallet to execute" : "connect the wallet that holds the balance"}</span> : null}
            </div>
          </div>
        </Module>

        <Module className="col-span-4 flex flex-col gap-3 md:col-span-4">
          <Label>What this does</Label>
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>Quotes every live Uniswap v3 route between the two assets (direct pool or one transaction through WETH) and shows the best output.</li>
            <li>Price impact is measured against the marginal pool price; anything above your limit is flagged, never hidden.</li>
            <li>The only approval is an exact amount to the Uniswap router. Unverified tokens stay hidden unless enabled in Settings (advanced).</li>
            <li>Execution opens the route page: simulate, sign in your wallet, track the receipt. Cross-chain moves live in the Router.</li>
          </ul>
          <Rule />
          <div className="mono text-[11px] text-muted">
            {discovery.data ? `${swapEdges.length} live swap edges on ${chain?.name}` : "no discovery yet"}
          </div>
        </Module>
      </div>
    </div>
  );
}
