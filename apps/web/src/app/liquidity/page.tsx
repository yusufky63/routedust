"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { encodeFunctionData, erc20Abi, isAddress, parseAbi, type Address } from "viem";
import { TICK_SPACING, displayPrice, formatAmount, fullRange, parseAmount, rangeAround, sqrtPriceX96FromAmounts, verifyErc20, type Asset } from "@testnet-router/core";
import { CHAINS } from "@testnet-router/registry";
import { parseUniswapFeed, type UniswapFeedDeployment } from "@testnet-router/providers";
import { Button, ExternalLink, Label, Module, PageTitle, Rule, Select, Tag, useMounted } from "@/components/ui";
import { AssetIcon, ChainIcon } from "@/components/icons";
import { useAllAssets } from "@/lib/assets";
import { txUrl } from "@/lib/format";
import { getClients } from "@/lib/router";
import { runSteps, type SimpleStep, type StepOutcome } from "@/lib/run-steps";
import { useRouterStore } from "@/lib/store";

const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const poolAbi = parseAbi(["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)"]);
const npmAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const FEES = [500, 3000, 10000];

interface Deployment {
  factory: Address;
  positionManager: Address;
}

/**
 * Liquidity page ("be the seller"): create a Uniswap v3 pool for your own
 * token against USDC or WETH, or add to an existing one. Everything is signed
 * by the wallet through the NonfungiblePositionManager; amounts are exact
 * approvals. Native ETH is not accepted directly: wrap it first (Router →
 * WETH) so both sides are ERC-20s.
 */
export default function LiquidityPage() {
  const mounted = useMounted();
  const { address } = useAccount();
  const config = useConfig();
  const assets = useAllAssets();
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const unverifiedTokens = useRouterStore((s) => s.settings.unverifiedTokens);
  const [feed, setFeed] = useState<Map<number, UniswapFeedDeployment> | undefined>(undefined);
  const [chainId, setChainId] = useState<number>(CHAINS[0]?.id ?? 11155111);
  const [tokenAId, setTokenAId] = useState<string>("");
  const [customA, setCustomA] = useState("");
  const [customAsset, setCustomAsset] = useState<Asset | undefined>(undefined);
  const [tokenBId, setTokenBId] = useState<string>("");
  const [fee, setFee] = useState<number>(3000);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [range, setRange] = useState<"full" | "50" | "10">("full");
  const [pool, setPool] = useState<{ address: Address; sqrtPriceX96: bigint } | null | undefined>(undefined);
  const [outcomes, setOutcomes] = useState<StepOutcome[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/feeds/uniswap")
      .then((r) => r.json())
      .then((j) => setFeed(parseUniswapFeed(j).deployments))
      .catch(() => setFeed(new Map()));
  }, []);

  const deployment = useMemo<Deployment | undefined>(() => {
    const d = feed?.get(chainId);
    return d?.factory && d.positionManager ? { factory: d.factory, positionManager: d.positionManager } : undefined;
  }, [feed, chainId]);
  const chains = CHAINS.filter((c) => {
    const d = feed?.get(c.id);
    return Boolean(d?.factory && d.positionManager);
  });
  const chainAssets = assets.filter((a) => a.chainId === chainId && a.kind === "ERC20");
  const counters = chainAssets.filter((a) => a.canonicalAssetId === "USDC" || a.representation === "WRAPPED_NATIVE");
  const tokenA = customAsset?.chainId === chainId && tokenAId === customAsset.id ? customAsset : chainAssets.find((a) => a.id === tokenAId);
  const tokenB = counters.find((a) => a.id === tokenBId);

  useEffect(() => {
    if (!counters.some((a) => a.id === tokenBId)) setTokenBId(counters.find((a) => a.canonicalAssetId === "USDC")?.id ?? counters[0]?.id ?? "");
  }, [counters, tokenBId]);

  // Existing pool + price for the pair / fee.
  useEffect(() => {
    setPool(undefined);
    if (!deployment || !tokenA?.address || !tokenB?.address) return;
    let cancelled = false;
    (async () => {
      try {
        const client = getClients(rpcOverrides).get(chainId);
        const addr = await client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "getPool", args: [tokenA.address as Address, tokenB.address as Address, fee] });
        if (addr === ZERO) {
          if (!cancelled) setPool(null);
          return;
        }
        const slot0 = await client.readContract({ address: addr, abi: poolAbi, functionName: "slot0" });
        if (!cancelled) setPool({ address: addr, sqrtPriceX96: slot0[0] });
      } catch {
        if (!cancelled) setPool(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deployment, tokenA, tokenB, fee, chainId, rpcOverrides]);

  if (!mounted) return null;

  const addCustom = async () => {
    if (!isAddress(customA)) {
      setError("enter a token address");
      return;
    }
    setError(undefined);
    try {
      const check = await verifyErc20(getClients(rpcOverrides).get(chainId), customA as Address);
      if (!check.hasCode || check.decimals === undefined) throw new Error("not an ERC-20 on this chain");
      const asset: Asset = {
        id: `${chainId}:${customA.toLowerCase()}`,
        chainId,
        canonicalAssetId: `TOKEN:${customA.toLowerCase()}`,
        kind: "ERC20",
        address: customA as Address,
        decimals: check.decimals,
        symbol: check.symbol ?? "TOKEN",
        name: check.symbol ?? "Token",
        representation: "UNKNOWN",
        verified: false,
      };
      setCustomAsset(asset);
      setTokenAId(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const token0First = tokenA?.address && tokenB?.address ? tokenA.address.toLowerCase() < tokenB.address.toLowerCase() : true;
  const t0 = token0First ? tokenA : tokenB;
  const t1 = token0First ? tokenB : tokenA;
  const currentPrice = pool && t0 && t1 ? displayPrice(pool.sqrtPriceX96, t0.decimals, t1.decimals) : undefined;

  const start = async () => {
    if (!address || !deployment || !tokenA?.address || !tokenB?.address || !t0?.address || !t1?.address) return;
    setError(undefined);
    let rawA: bigint;
    let rawB: bigint;
    try {
      rawA = parseAmount(amountA || "0", tokenA.decimals);
      rawB = parseAmount(amountB || "0", tokenB.decimals);
    } catch {
      setError("invalid amount");
      return;
    }
    if (rawA <= 0n || rawB <= 0n) {
      setError("enter both amounts");
      return;
    }
    const amount0 = token0First ? rawA : rawB;
    const amount1 = token0First ? rawB : rawA;
    const sqrtPriceX96 = pool ? pool.sqrtPriceX96 : sqrtPriceX96FromAmounts(amount0, amount1);
    const ticks = range === "full" ? fullRange(fee) : rangeAround(sqrtPriceX96, fee, range === "50" ? 50 : 10);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const client = getClients(rpcOverrides).get(chainId);
    const steps: SimpleStep[] = [];
    for (const [asset, amount] of [
      [t0, amount0],
      [t1, amount1],
    ] as [Asset, bigint][]) {
      const allowance = await client.readContract({ address: asset.address as Address, abi: erc20Abi, functionName: "allowance", args: [address, deployment.positionManager] });
      if (allowance < amount) {
        steps.push({
          label: `Approve ${asset.symbol} (exact) for the position manager`,
          tx: { chainId, to: asset.address as Address, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [deployment.positionManager, amount] }) },
        });
      }
    }
    const calls: `0x${string}`[] = [];
    if (!pool) {
      calls.push(encodeFunctionData({ abi: npmAbi, functionName: "createAndInitializePoolIfNecessary", args: [t0.address as Address, t1.address as Address, fee, sqrtPriceX96] }));
    }
    calls.push(
      encodeFunctionData({
        abi: npmAbi,
        functionName: "mint",
        args: [
          {
            token0: t0.address as Address,
            token1: t1.address as Address,
            fee,
            tickLower: ticks.tickLower,
            tickUpper: ticks.tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: address,
            deadline,
          },
        ],
      }),
    );
    steps.push({
      label: pool ? `Add liquidity to the ${fee / 10_000}% pool` : `Create the ${fee / 10_000}% pool and add liquidity`,
      tx: { chainId, to: deployment.positionManager, value: 0n, data: encodeFunctionData({ abi: npmAbi, functionName: "multicall", args: [calls] }) },
    });
    setBusy(true);
    try {
      await runSteps(config, address, steps, setOutcomes);
    } finally {
      setBusy(false);
    }
  };

  const spacing = TICK_SPACING[fee] ?? 60;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Liquidity" meta="Create a Uniswap v3 pool for your token or add to one · both sides ERC-20 · exact approvals to the position manager only">
        <Link href="/swap" className="btn">
          Swap →
        </Link>
      </PageTitle>

      {!address ? (
        <Module>
          <p className="text-sm text-muted">Connect the wallet that holds the tokens.</p>
        </Module>
      ) : null}

      <div className="grid-12">
        <Module className="col-span-4 flex flex-col gap-5 !p-6 md:col-span-8">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label>Chain</Label>
              <Select
                ariaLabel="Chain"
                value={chainId}
                onChange={(id) => {
                  setChainId(id);
                  setTokenAId("");
                  setOutcomes(undefined);
                }}
                options={chains.map((c) => ({ value: c.id, label: c.name, icon: <ChainIcon chainId={c.id} size={16} /> }))}
                placeholder={feed ? "No v3 deployment" : "Loading feed…"}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Your token</Label>
              <Select
                ariaLabel="Token"
                value={tokenAId}
                onChange={setTokenAId}
                placeholder="Pick a token"
                options={[
                  ...chainAssets.map((a) => ({ value: a.id, label: a.symbol, hint: a.verified ? "verified" : "unverified", icon: <AssetIcon asset={a} size={16} /> })),
                  ...(customAsset && customAsset.chainId === chainId && !chainAssets.some((a) => a.id === customAsset.id) ? [{ value: customAsset.id, label: customAsset.symbol, hint: "by address", icon: <AssetIcon asset={customAsset} size={16} /> }] : []),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Paired with</Label>
              <Select ariaLabel="Counter asset" value={tokenBId} onChange={setTokenBId} options={counters.map((a) => ({ value: a.id, label: a.symbol, icon: <AssetIcon asset={a} size={16} /> }))} />
            </div>
          </div>

          {unverifiedTokens ? (
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input value={customA} onChange={(e) => setCustomA(e.target.value.trim())} placeholder="0x… your token contract" spellCheck={false} className="w-full md:w-80" aria-label="Token contract address" />
              <Button onClick={() => void addCustom()} disabled={!isAddress(customA)}>
                Use this token
              </Button>
            </div>
          ) : (
            <p className="mono text-[11px] text-muted">To pair a token that is not in the registry, enable “Unverified tokens” in Settings and paste its address here.</p>
          )}

          <Rule />

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Fee tier</Label>
              {FEES.map((f) => (
                <button key={f} type="button" className={`btn !px-2.5 !py-1 ${fee === f ? "btn-active" : ""}`} onClick={() => setFee(f)}>
                  {f / 10_000}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label>Range</Label>
              {(["full", "50", "10"] as const).map((r) => (
                <button key={r} type="button" className={`btn !px-2.5 !py-1 ${range === r ? "btn-active" : ""}`} onClick={() => setRange(r)} disabled={r !== "full" && !pool}>
                  {r === "full" ? "Full range" : `±${r}%`}
                </button>
              ))}
            </div>
            <span className="mono text-[11px] text-muted">tick spacing {spacing}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pool === undefined && tokenA && tokenB ? <Tag>CHECKING POOL</Tag> : null}
            {pool === null ? <Tag tone="accent">NEW POOL · your amounts set the initial price</Tag> : null}
            {pool ? (
              <>
                <Tag tone="ok">POOL EXISTS</Tag>
                <span className="mono text-[11px] text-muted">
                  price {currentPrice !== undefined ? currentPrice.toPrecision(6) : "…"} {t1?.symbol} per {t0?.symbol} · <ExternalLink href={`${CHAINS.find((c) => c.id === chainId)?.explorerUrl}/address/${pool.address}`}>pool</ExternalLink>
                </span>
              </>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>{tokenA?.symbol ?? "Token"} amount</Label>
              <input value={amountA} onChange={(e) => setAmountA(e.target.value)} inputMode="decimal" placeholder="0.0" className="num w-full !text-lg" aria-label="Token amount" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{tokenB?.symbol ?? "Counter"} amount</Label>
              <input value={amountB} onChange={(e) => setAmountB(e.target.value)} inputMode="decimal" placeholder="0.0" className="num w-full !text-lg" aria-label="Counter amount" />
              {pool === null && amountA && amountB && tokenA && tokenB ? (
                <span className="mono text-[11px] text-muted">
                  initial price ≈ {(Number(amountB) / Number(amountA)).toPrecision(6)} {tokenB.symbol} per {tokenA.symbol}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button variant="solid" onClick={() => void start()} disabled={busy || !address || !deployment || !tokenA || !tokenB || pool === undefined}>
              {busy ? "Signing…" : pool ? "Add liquidity" : "Create pool + add liquidity"}
            </Button>
            {error ? <span className="mono text-[11px] text-error">{error}</span> : null}
          </div>

          {outcomes ? (
            <ol className="flex flex-col border-t border-border pt-3">
              {outcomes.map((o, i) => (
                <li key={i} className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="mono text-xs">
                    {String(i + 1).padStart(2, "0")} / {o.label}
                    {o.txHash ? (
                      <>
                        {" · "}
                        <ExternalLink href={txUrl(chainId, o.txHash)}>{o.txHash.slice(0, 10)}…</ExternalLink>
                      </>
                    ) : null}
                    {o.error ? <span className="text-error"> · {o.error}</span> : null}
                  </span>
                  <Tag tone={o.status === "confirmed" ? "ok" : o.status === "failed" ? "err" : o.status === "signing" ? "accent" : "muted"}>{o.status.toUpperCase()}</Tag>
                </li>
              ))}
            </ol>
          ) : null}
        </Module>

        <Module className="col-span-4 flex flex-col gap-3 md:col-span-4">
          <Label>How it works</Label>
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>A pool is (token0, token1, fee). If it does not exist, it is created and initialised at the price implied by your two amounts, in the same transaction as the first position.</li>
            <li>Full range never goes out of range; a ±10 % or ±50 % band concentrates the liquidity around the current price and earns more fees while the price stays inside it.</li>
            <li>Once the pool has liquidity, the router discovers it on the next discovery run and the token becomes sellable (Swap, Router) for anyone.</li>
            <li>Approvals are exact and go to the NonfungiblePositionManager only. The position is an NFT in your wallet; remove it from the Uniswap app if needed.</li>
            <li>Native ETH is not accepted here: wrap first (Router → WETH on this chain) so both sides are ERC-20s.</li>
          </ul>
          <Rule />
          <div className="mono text-[11px] text-muted">
            {deployment ? `position manager ${deployment.positionManager.slice(0, 10)}… · factory ${deployment.factory.slice(0, 10)}…` : "no Uniswap v3 position manager in the feed for this chain"}
          </div>
          {chains.length > 0 ? <div className="mono text-[11px] text-muted">chains with v3: {chains.map((c) => c.shortName).join(" · ")}</div> : null}
          <div className="mono text-[11px] text-muted">Amounts shown as {formatAmount(0n, 6)} style; testnet tokens have no market value.</div>
        </Module>
      </div>
    </div>
  );
}
