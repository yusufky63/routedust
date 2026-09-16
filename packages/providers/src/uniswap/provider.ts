import { encodeFunctionData, parseAbi, type PublicClient } from "viem";
import {
  applyBps,
  nodeFromAsset,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { UNISWAP_V3_DEPLOYMENTS, nativeAsset, usdcAsset, wrappedNative, type UniswapV3Deployment } from "@testnet-router/registry";
import { ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, runtimeSource, stepId } from "../shared";

const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const poolAbi = parseAbi(["function liquidity() view returns (uint128)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
]);

/** SwapRouter02 sentinel: keep output inside the router for a follow-up unwrap. */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;
const PROBE_AMOUNT = 10n ** 14n; // 0.0001 of an 18-decimal asset
const QUOTE_TTL_MS = 45_000;
const PROBE_TTL_MS = 5 * 60_000;

interface SwapMeta {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  nativeIn: boolean;
  nativeOut: boolean;
  feeTiers: number[];
  pools: Record<number, Address>;
  router: Address;
  quoter: Address;
}

interface LivePool {
  fee: number;
  pool: Address;
  liquidity: bigint;
}

async function livePools(client: PublicClient, d: UniswapV3Deployment, tokenA: Address, tokenB: Address): Promise<LivePool[]> {
  const pools = await client.multicall({
    contracts: d.feeTiers.map((fee) => ({
      address: d.factory,
      abi: factoryAbi,
      functionName: "getPool" as const,
      args: [tokenA, tokenB, fee] as const,
    })),
    allowFailure: true,
  });
  const existing: { fee: number; pool: Address }[] = [];
  pools.forEach((r, i) => {
    const fee = d.feeTiers[i];
    if (fee === undefined || r.status !== "success") return;
    const pool = r.result as Address;
    if (pool !== ZERO_ADDRESS) existing.push({ fee, pool });
  });
  if (existing.length === 0) return [];
  const liquidity = await client.multicall({
    contracts: existing.map((p) => ({ address: p.pool, abi: poolAbi, functionName: "liquidity" as const })),
    allowFailure: true,
  });
  const live: LivePool[] = [];
  liquidity.forEach((r, i) => {
    const p = existing[i];
    if (!p || r.status !== "success") return;
    const liq = r.result as bigint;
    if (liq > 0n) live.push({ fee: p.fee, pool: p.pool, liquidity: liq });
  });
  return live;
}

async function quoteSingle(
  client: PublicClient,
  quoter: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const { result } = await client.simulateContract({
      address: quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    return { amountOut: result[0], gasEstimate: result[3] };
  } catch {
    return null;
  }
}

/**
 * Uniswap v3 same-chain swaps. Edges exist only after: deployment -> pool
 * exists -> non-zero liquidity -> probe quote succeeds (spec section 6.1).
 */
export const uniswapProvider: RouteProvider = {
  key: "uniswap",
  name: "Uniswap v3",
  source: UNISWAP_V3_DEPLOYMENTS[0]?.source ?? runtimeSource("https://developers.uniswap.org"),

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    for (const d of UNISWAP_V3_DEPLOYMENTS) {
      if (!ctx.chains.some((c) => c.id === d.chainId)) continue;
      const usdc = usdcAsset(d.chainId);
      const wrapped = wrappedNative(d.chainId);
      const native = nativeAsset(d.chainId);
      if (!usdc?.address || !wrapped?.address) continue;
      const client = ctx.clients.get(d.chainId);
      let pools: LivePool[] = [];
      try {
        pools = await livePools(client, d, wrapped.address, usdc.address);
      } catch {
        continue;
      }
      if (pools.length === 0) continue;

      // Probe both directions with a tiny amount; keep only tiers that quote.
      const usableIn: LivePool[] = [];
      const usableOut: LivePool[] = [];
      for (const p of pools) {
        const [a, b] = await Promise.all([
          quoteSingle(client, d.quoterV2, wrapped.address, usdc.address, PROBE_AMOUNT, p.fee),
          quoteSingle(client, d.quoterV2, usdc.address, wrapped.address, 10n ** 5n, p.fee),
        ]);
        if (a && a.amountOut > 0n) usableIn.push(p);
        if (b && b.amountOut > 0n) usableOut.push(p);
      }
      const source = runtimeSource(
        d.source.url,
        `Live pool check on chain ${d.chainId}: ${pools.map((p) => `${p.fee}bps@${p.pool}`).join(", ")}`,
      );
      const mk = (from: Asset, to: Asset, tiers: LivePool[], nativeIn: boolean, nativeOut: boolean): CapabilityEdge => {
        const fromNode = nodeFromAsset(from);
        const toNode = nodeFromAsset(to);
        const meta: SwapMeta = {
          chainId: d.chainId,
          tokenIn: nativeIn ? d.weth9 : (from.address as Address),
          tokenOut: nativeOut ? d.weth9 : (to.address as Address),
          nativeIn,
          nativeOut,
          feeTiers: tiers.map((t) => t.fee),
          pools: Object.fromEntries(tiers.map((t) => [t.fee, t.pool])),
          router: d.swapRouter02,
          quoter: d.quoterV2,
        };
        return {
          id: edgeId("uniswap", "SWAP", fromNode, toNode),
          provider: "uniswap",
          type: "SWAP",
          from: fromNode,
          to: toNode,
          crossChain: false,
          requiresApproval: !nativeIn,
          requiresSourceGas: true,
          requiresDestinationGas: false,
          outputCanonicality: to.representation === "WRAPPED_NATIVE" ? "WRAPPED" : to.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
          reliabilityClass: "LIQUIDITY",
          baselineGasUnits: 200_000n,
          baselineSeconds: 20,
          source,
          meta: meta as unknown as Record<string, unknown>,
        };
      };
      if (usableIn.length > 0) {
        edges.push(mk(native, usdc, usableIn, true, false));
        edges.push(mk(wrapped, usdc, usableIn, false, false));
      }
      if (usableOut.length > 0) {
        edges.push(mk(usdc, native, usableOut, false, true));
        edges.push(mk(usdc, wrapped, usableOut, false, false));
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as SwapMeta;
    const client = req.clients.get(meta.chainId);
    let best: { fee: number; amountOut: bigint; gasEstimate: bigint } | null = null;
    for (const fee of meta.feeTiers) {
      const q = await quoteSingle(client, meta.quoter, meta.tokenIn, meta.tokenOut, req.amountIn, fee);
      if (q && (!best || q.amountOut > best.amountOut)) best = { fee, ...q };
    }
    if (!best || best.amountOut === 0n) return null;
    const feeOut = (best.amountOut * BigInt(best.fee)) / 1_000_000n;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `pool ${meta.pools[best.fee]} fee ${best.fee / 10_000}%`,
      quote: {
        provider: "uniswap",
        amountIn: req.amountIn,
        amountOut: best.amountOut,
        minAmountOut: applyBps(best.amountOut, req.slippageBps),
        feeOut,
        estimatedGasUnits: best.gasEstimate + 70_000n,
        estimatedSeconds: 20,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: { fee: best.fee, pool: meta.pools[best.fee] },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as SwapMeta;
    const raw = edge.quote.raw as { fee: number };
    const client = ctx.clients.get(meta.chainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const steps: ExecutionStep[] = [];
    const amountIn = ctx.amountIn;
    const minOut = amountIn === edge.quote.amountIn ? edge.quote.minAmountOut : applyBps((edge.quote.amountOut * amountIn) / edge.quote.amountIn, 100);

    if (!meta.nativeIn) {
      const approve = await approvalStepIfNeeded({
        client,
        chainId: meta.chainId,
        token: meta.tokenIn,
        owner: ctx.wallet,
        spender: meta.router,
        amount: amountIn,
        provider: "uniswap",
        edgeId: edge.id,
        symbol: fromAsset.symbol,
      });
      if (approve) steps.push(approve);
    }

    const deadline = BigInt(Math.floor(edge.quote.expiresAt / 1000) + 120);
    const swapCall = encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: meta.tokenIn,
          tokenOut: meta.tokenOut,
          fee: raw.fee,
          recipient: meta.nativeOut ? ADDRESS_THIS : ctx.recipient,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const calls: `0x${string}`[] = [swapCall];
    if (meta.nativeOut) {
      calls.push(encodeFunctionData({ abi: routerAbi, functionName: "unwrapWETH9", args: [minOut, ctx.recipient] }));
    }
    const data = encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [deadline, calls] });

    steps.push({
      id: stepId(edge.id, "swap"),
      type: "SWAP",
      chainId: meta.chainId,
      provider: "uniswap",
      edgeId: edge.id,
      label: `Swap ${fromAsset.symbol} on Uniswap v3 (${raw.fee / 10_000}% pool)`,
      status: "PENDING",
      simulate: true,
      expiresAt: edge.quote.expiresAt + 120_000,
      tx: { chainId: meta.chainId, to: meta.router, value: meta.nativeIn ? amountIn : 0n, data },
    });
    return steps;
  },

  async status() {
    return { kind: "COMPLETED" };
  },
};

export { PROBE_TTL_MS as UNISWAP_DISCOVERY_TTL_MS };
