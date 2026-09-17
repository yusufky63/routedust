"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { formatAmount, parseAmount, quoteCapabilityPath, type CapabilityEdge, type RouteCandidate } from "@testnet-router/core";
import { CHAINS, nodeOf } from "@testnet-router/registry";
import { CustomTokenForm, RecipientField } from "@/components/destination-selector";
import { PriceHistory } from "@/components/price-history";
import { Button, Label, Module, PageTitle, Rule, Select, Tag, useMounted } from "@/components/ui";
import { AssetIcon, ChainIcon } from "@/components/icons";
import { WatchAddressForm } from "@/components/watch-address";
import { useAllAssets } from "@/lib/assets";
import { useDiscovery } from "@/hooks/use-discovery";
import { useExecutor } from "@/hooks/use-executor";
import { useScan } from "@/hooks/use-scan";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";
import { edgeLabel } from "@/lib/format";

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
  const recipient = isAddress(settings.recipient) ? (settings.recipient as Address) : undefined;

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
      setError("No live pool connects these two on this chain.");
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
            recipient,
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
  }, [pay, receive, amountIn, paths, address, assets, settings.rpcOverrides, settings.slippageBps, recipient]);

  if (!mounted) return null;

  const canExecute = Boolean(connected && address && (!scan || scan.wallet.toLowerCase() === connected.toLowerCase()));
  const overBalance = amountIn > balance && balance > 0n;
  const impact = quote?.priceImpactBps;
  const rate =
    quote && pay && receive && amountIn > 0n
      ? Number(formatAmount(quote.amountOut, receive.decimals, { grouping: false, maxFractionDigits: 12 })) / Number(formatAmount(amountIn, pay.decimals, { grouping: false, maxFractionDigits: 12 }))
      : undefined;
  const v3Pool = quote && quote.edges.length === 1 && quote.edges[0]?.provider === "uniswap" ? (quote.edges[0]?.quote.raw as { pool?: Address } | undefined)?.pool : undefined;
  const canFlip = Boolean(pay && receive && payables.some((a) => a.id === receive.id) && receivables.some((a) => a.id === pay.id));
  const flip = () => {
    if (!pay || !receive || !canFlip) return;
    setPayId(receive.id);
    setReceiveId(pay.id);
    setAmountText("");
  };

  const execute = () => {
    if (!quote) return;
    const ex = create(quote, { recipient });
    router.push(`/route/${ex.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Swap" meta="Same-chain buy / sell through live pools · price impact shown, never hidden · your wallet signs, no intermediary">
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
        <Module className="col-span-4 flex flex-col gap-5 !p-5 md:col-span-8 md:!p-6">
          <div className="flex flex-col gap-1 md:w-80">
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

          <div className="module-raised flex flex-col gap-3 !p-4">
            <div className="flex items-center justify-between">
              <Label>You pay</Label>
              <span className="mono text-[11px] text-muted">
                balance {pay ? formatAmount(balance, pay.decimals) : "—"} {pay?.symbol}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className="num w-full !border-0 !bg-transparent !px-0 !text-3xl md:!text-4xl"
                aria-label="Amount to sell"
              />
              <Select
                ariaLabel="Asset to sell"
                value={payId}
                onChange={setPayId}
                disabled={payables.length === 0}
                placeholder="No sellable asset"
                align="right"
                options={payables.map((a) => ({
                  value: a.id,
                  label: a.symbol,
                  hint: `${formatAmount(balances.get(a.id) ?? 0n, a.decimals)}${a.verified ? "" : " · unverified"}`,
                  icon: <AssetIcon asset={a} size={16} />,
                }))}
              />
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
              {overBalance ? <span className="mono ml-2 text-[11px] text-warning">amount exceeds balance</span> : null}
            </div>
          </div>

          <div className="-my-2 flex justify-center">
            <button type="button" onClick={flip} disabled={!canFlip} className="btn !rounded-full !px-3 !py-1" title="Swap direction" aria-label="Swap direction">
              ⇅
            </button>
          </div>

          <div className="module-raised flex flex-col gap-3 !p-4">
            <div className="flex items-center justify-between">
              <Label>You receive</Label>
              {quote ? <Tag tone="ok">LIVE QUOTE</Tag> : quoting ? <Tag>QUOTING</Tag> : null}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
              <div className={`display num text-3xl leading-none md:text-4xl ${quoting ? "text-muted" : ""}`}>{quote ? formatAmount(quote.amountOut, receive?.decimals ?? 18) : quoting ? "…" : "0.0"}</div>
              <Select
                ariaLabel="Asset to buy"
                value={receiveId}
                onChange={setReceiveId}
                disabled={receivables.length === 0}
                placeholder="No buyable asset"
                align="right"
                options={receivables.filter((a) => a.id !== payId).map((a) => ({ value: a.id, label: a.symbol, hint: a.verified ? undefined : "unverified", icon: <AssetIcon asset={a} size={16} /> }))}
              />
            </div>
            {unverifiedTokens ? (
              <button
                type="button"
                onClick={() => setShowCustom(!showCustom)}
                className={`mono self-start border-b text-[11px] uppercase tracking-[0.08em] ${showCustom ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
              >
                Buy a token by address or symbol…
              </button>
            ) : null}
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
          </div>

          <RecipientField />

          {quote || error ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex flex-wrap gap-1">
                {quote ? (
                  <>
                    <Tag>{quote.txCount} TX</Tag>
                    {impact !== undefined ? <Tag tone={impact > 500 ? "err" : impact > 100 ? "warn" : "muted"}>IMPACT {(impact / 100).toFixed(2)}%</Tag> : null}
                    {pay && !pay.verified ? <Tag tone="warn">UNVERIFIED TOKEN</Tag> : null}
                    {receive && !receive.verified ? <Tag tone="warn">BUY UNVERIFIED</Tag> : null}
                  </>
                ) : null}
                {error ? <Tag tone="err">{error.slice(0, 80)}</Tag> : null}
              </div>
              {quote ? (
                <dl className="mono grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-muted md:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt>rate</dt>
                    <dd className="num text-text">
                      1 {pay?.symbol} ≈ {rate !== undefined ? (rate >= 1000 ? rate.toFixed(2) : rate.toPrecision(6)) : "—"} {receive?.symbol}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>min received</dt>
                    <dd className="num text-text">
                      {formatAmount(quote.minAmountOut, receive?.decimals ?? 18)} {receive?.symbol}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>slippage</dt>
                    <dd className="text-text">{settings.slippageBps / 100}%</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>route</dt>
                    <dd className="text-right text-text">{quote.edges.map((e) => `${edgeLabel(e.type, e.provider)}${e.healthNote ? ` · ${e.healthNote.split(" · ")[0]}` : ""}`).join(" → ")}</dd>
                  </div>
                  {impact !== undefined && impact > settings.maxPriceImpactBps ? (
                    <div className="col-span-full text-error">above your {settings.maxPriceImpactBps / 100}% impact limit: sell less or accept the loss</div>
                  ) : null}
                </dl>
              ) : null}
              {quote && v3Pool && pay?.address && receive?.address ? (
                <PriceHistory
                  chainId={chainId}
                  pool={v3Pool}
                  decimals0={pay.address.toLowerCase() < receive.address.toLowerCase() ? pay.decimals : receive.decimals}
                  decimals1={pay.address.toLowerCase() < receive.address.toLowerCase() ? receive.decimals : pay.decimals}
                  invert={!(pay.address.toLowerCase() < receive.address.toLowerCase())}
                  label={`${receive.symbol} per ${pay.symbol}`}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button variant="solid" onClick={execute} disabled={!quote || quoting || !canExecute || overBalance} className="!px-6 !py-3">
              {pay && receive ? `Swap ${pay.symbol} → ${receive.symbol}` : "Swap"}
            </Button>
            {!canExecute && address ? <span className="mono text-[11px] text-muted">{watching ? "watching: connect this wallet to execute" : "connect the wallet that holds the balance"}</span> : null}
          </div>
        </Module>

        <Module className="col-span-4 flex flex-col gap-3 md:col-span-4">
          <Label>What this does</Label>
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>Quotes every live route between the two assets on this chain (Uniswap v3 single pool, split across fee tiers, one transaction through WETH, v4 pools, v2-style AMMs) and shows the best output.</li>
            <li>Price impact is measured against the marginal pool price; anything above your limit is flagged, never hidden.</li>
            <li>The only approval is an exact amount to the router. Unverified tokens stay hidden unless enabled in Settings (advanced); their sale is simulated through the real router first.</li>
            <li>Execution opens the route page: simulate, sign in your wallet, track the receipt. Cross-chain moves live in the Router.</li>
          </ul>
          <Rule />
          <div className="mono text-[11px] text-muted">{discovery.data ? `${swapEdges.length} live swap edges on ${chain?.name}` : "no discovery yet"}</div>
        </Module>
      </div>
    </div>
  );
}
