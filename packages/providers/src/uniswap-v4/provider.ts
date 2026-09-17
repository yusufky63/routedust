import { encodeAbiParameters, encodeFunctionData, encodePacked, keccak256, parseAbi, type PublicClient } from "viem";
import {
  applyBps,
  nodeFromAsset,
  ratio,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { SOURCES, nativeAsset, usdcAsset } from "@testnet-router/registry";
import { TtlCache, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, fetchJson, runtimeSource, stepId } from "../shared";
import { UNISWAP_DEPLOYMENTS_FEED_URL, parseUniswapFeed, type UniswapFeedDeployment } from "../uniswap/feed";

const stateViewAbi = parseAbi(["function getLiquidity(bytes32 poolId) view returns (uint128)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const universalRouterAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const permit2Abi = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

/** Universal Router command and v4 router actions. */
const COMMAND_V4_SWAP = "0x10" as const;
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE = 0x0e;
/** OPEN_DELTA: take the full credit of the currency. */
const OPEN_DELTA = 0n;

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;
const SWAP_PARAMS_ABI = [
  {
    type: "tuple",
    name: "params",
    components: [
      { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

/** Fee / tick-spacing combinations Uniswap's own interface creates for hookless pools. */
const COMBOS: { fee: number; tickSpacing: number }[] = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
];
const PROBE_NATIVE = 10n ** 14n;
const PROBE_USDC = 10n ** 5n;
const QUOTE_TTL_MS = 45_000;
const PERMIT2_EXPIRY_S = 30 * 60;

const feedCache = new TtlCache<Map<number, UniswapFeedDeployment>>(15 * 60_000);
const marginalCache = new TtlCache<bigint | null>(60_000);

interface Pool {
  fee: number;
  tickSpacing: number;
  liquidity: string;
}

interface V4Meta {
  chainId: number;
  /** currency0 is always native (address zero sorts first). */
  currency1: Address;
  nativeIn: boolean;
  pools: Pool[];
  quoter: Address;
  universalRouter: Address;
  permit2: Address;
}

interface Deployment {
  chainId: number;
  poolManager: Address;
  quoter: Address;
  stateView: Address;
  universalRouter: Address;
  permit2: Address;
  feedUrl: string;
  tier?: string;
}

function poolId(currency0: Address, currency1: Address, fee: number, tickSpacing: number): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [currency0, currency1, fee, tickSpacing, ZERO_ADDRESS]),
  );
}

async function resolve(ctx: Parameters<RouteProvider["discover"]>[0]): Promise<Deployment[]> {
  const feedUrl = ctx.feeds?.uniswapDeployments ?? UNISWAP_DEPLOYMENTS_FEED_URL;
  let feed: Map<number, UniswapFeedDeployment> | undefined;
  try {
    feed = await feedCache.get(feedUrl, async () => parseUniswapFeed(await fetchJson<unknown>(ctx.fetch, feedUrl, undefined, 30_000)).deployments);
  } catch {
    return [];
  }
  const out: Deployment[] = [];
  for (const chain of ctx.chains) {
    const fd = feed.get(chain.id);
    if (!fd?.v4PoolManager || !fd.v4Quoter || !fd.v4StateView || !fd.universalRouter || !fd.permit2) continue;
    out.push({ chainId: chain.id, poolManager: fd.v4PoolManager, quoter: fd.v4Quoter, stateView: fd.v4StateView, universalRouter: fd.universalRouter, permit2: fd.permit2, feedUrl, tier: fd.tier });
  }
  return out;
}

async function quotePool(client: PublicClient, quoter: Address, currency1: Address, pool: Pool, zeroForOne: boolean, amountIn: bigint): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const { result } = await client.simulateContract({
      address: quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ poolKey: { currency0: ZERO_ADDRESS, currency1, fee: pool.fee, tickSpacing: pool.tickSpacing, hooks: ZERO_ADDRESS }, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
    });
    return { amountOut: result[0], gasEstimate: result[1] };
  } catch {
    return null;
  }
}

function poolLabel(p: Pool): string {
  return `${p.fee / 10_000}% pool (spacing ${p.tickSpacing})`;
}

/**
 * Uniswap v4 hookless native/USDC pools through the Universal Router. Pools
 * are discovered from StateView liquidity and a probe quote on the V4Quoter;
 * ERC-20 input goes through Permit2 (exact amount, short expiry).
 */
export const uniswapV4Provider: RouteProvider = {
  key: "uniswap-v4",
  name: "Uniswap v4",
  source: SOURCES.uniswapFeed,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    for (const d of await resolve(ctx)) {
      const usdc = usdcAsset(d.chainId);
      const native = nativeAsset(d.chainId);
      if (!usdc?.address || native.kind !== "NATIVE") continue;
      const usdcAddress = usdc.address;
      const client = ctx.clients.get(d.chainId);
      let liquidity: { status: "success" | "failure"; result?: unknown }[];
      try {
        liquidity = await client.multicall({
          contracts: COMBOS.map((c) => ({ address: d.stateView, abi: stateViewAbi, functionName: "getLiquidity" as const, args: [poolId(ZERO_ADDRESS, usdcAddress, c.fee, c.tickSpacing)] as const })),
          allowFailure: true,
        });
      } catch {
        continue;
      }
      const live: Pool[] = [];
      liquidity.forEach((r, i) => {
        const combo = COMBOS[i];
        if (!combo || r.status !== "success") return;
        const liq = r.result as bigint;
        if (liq > 0n) live.push({ fee: combo.fee, tickSpacing: combo.tickSpacing, liquidity: liq.toString() });
      });
      if (live.length === 0) continue;

      const sellable: Pool[] = [];
      const buyable: Pool[] = [];
      for (const p of live) {
        const [a, b] = await Promise.all([quotePool(client, d.quoter, usdcAddress, p, true, PROBE_NATIVE), quotePool(client, d.quoter, usdcAddress, p, false, PROBE_USDC)]);
        if (a && a.amountOut > 0n) sellable.push(p);
        if (b && b.amountOut > 0n) buyable.push(p);
      }
      const source = runtimeSource(d.feedUrl, `Uniswap v4 (${d.tier ?? "feed"}) on chain ${d.chainId}; live hookless ETH/USDC pools: ${live.map((p) => `${p.fee}bps`).join(", ")}`);
      const mk = (from: Asset, to: Asset, pools: Pool[], nativeIn: boolean): CapabilityEdge => {
        const fromNode = nodeFromAsset(from);
        const toNode = nodeFromAsset(to);
        const meta: V4Meta = { chainId: d.chainId, currency1: usdcAddress, nativeIn, pools, quoter: d.quoter, universalRouter: d.universalRouter, permit2: d.permit2 };
        return {
          id: edgeId("uniswap-v4", "SWAP", fromNode, toNode),
          provider: "uniswap-v4",
          type: "SWAP",
          from: fromNode,
          to: toNode,
          crossChain: false,
          requiresApproval: !nativeIn,
          requiresSourceGas: true,
          requiresDestinationGas: false,
          outputCanonicality: to.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
          reliabilityClass: "LIQUIDITY",
          baselineGasUnits: nativeIn ? 150_000n : 220_000n,
          baselineSeconds: 20,
          source,
          meta: meta as unknown as Record<string, unknown>,
        };
      };
      if (sellable.length > 0) edges.push(mk(native, usdc, sellable, true));
      if (buyable.length > 0) edges.push(mk(usdc, native, buyable, false));
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as V4Meta;
    const client = req.clients.get(meta.chainId);
    let best: { pool: Pool; amountOut: bigint; gasEstimate: bigint } | null = null;
    for (const pool of meta.pools) {
      const q = await quotePool(client, meta.quoter, meta.currency1, pool, meta.nativeIn, req.amountIn);
      if (q && (!best || q.amountOut > best.amountOut)) best = { pool, ...q };
    }
    if (!best || best.amountOut === 0n) return null;
    const chosen = best;
    // Price impact: effective price vs a tiny marginal probe on the same pool.
    let impact: number | undefined;
    const probeIn = req.amountIn / 1000n;
    if (probeIn > 0n) {
      const key = `${req.edge.id}|${chosen.pool.fee}|${probeIn}`;
      const probeOut = await marginalCache.get(key, async () => (await quotePool(client, meta.quoter, meta.currency1, chosen.pool, meta.nativeIn, probeIn))?.amountOut ?? null);
      if (probeOut && probeOut > 0n) impact = Math.max(0, Math.round((1 - ratio(chosen.amountOut * probeIn, probeOut * req.amountIn)) * 10_000));
    }
    const label = `v4 ${poolLabel(chosen.pool)}`;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: impact !== undefined ? `${label} · impact ${(impact / 100).toFixed(2)}%` : label,
      quote: {
        provider: "uniswap-v4",
        amountIn: req.amountIn,
        amountOut: chosen.amountOut,
        minAmountOut: applyBps(chosen.amountOut, req.slippageBps),
        feeOut: (chosen.amountOut * BigInt(chosen.pool.fee)) / 1_000_000n,
        estimatedGasUnits: chosen.gasEstimate + (meta.nativeIn ? 80_000n : 120_000n),
        estimatedSeconds: 20,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        priceImpactBps: impact,
        raw: { pool: chosen.pool },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as V4Meta;
    const raw = edge.quote.raw as { pool: Pool };
    const client = ctx.clients.get(meta.chainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const amountIn = ctx.amountIn;
    const minOut = amountIn === edge.quote.amountIn ? edge.quote.minAmountOut : applyBps((edge.quote.amountOut * amountIn) / edge.quote.amountIn, 100);
    const steps: ExecutionStep[] = [];
    const nowS = Math.floor(Date.now() / 1000);

    if (!meta.nativeIn) {
      // ERC-20 → Permit2 (exact), then Permit2 → Universal Router (exact, short expiry).
      const approve = await approvalStepIfNeeded({
        client,
        chainId: meta.chainId,
        token: meta.currency1,
        owner: ctx.wallet,
        spender: meta.permit2,
        amount: amountIn,
        provider: "uniswap-v4",
        edgeId: edge.id,
        symbol: fromAsset.symbol,
      });
      if (approve) steps.push(approve);
      const [allowed, expiration] = await client.readContract({ address: meta.permit2, abi: permit2Abi, functionName: "allowance", args: [ctx.wallet, meta.currency1, meta.universalRouter] });
      if (allowed < amountIn || expiration <= nowS + 60) {
        steps.push({
          id: stepId(edge.id, "permit2"),
          type: "APPROVE",
          chainId: meta.chainId,
          provider: "uniswap-v4",
          edgeId: edge.id,
          label: `Permit2 allowance for Universal Router (${fromAsset.symbol}, exact amount, 30 min)`,
          status: "PENDING",
          simulate: true,
          summary: `Permit2.approve(${meta.currency1}, UniversalRouter ${meta.universalRouter}, ${amountIn} units, expires in 30 min)`,
          tx: {
            chainId: meta.chainId,
            to: meta.permit2,
            value: 0n,
            data: encodeFunctionData({ abi: permit2Abi, functionName: "approve", args: [meta.currency1, meta.universalRouter, amountIn, nowS + PERMIT2_EXPIRY_S] }),
          },
        });
      }
    }

    const currencyIn = meta.nativeIn ? ZERO_ADDRESS : meta.currency1;
    const currencyOut = meta.nativeIn ? meta.currency1 : ZERO_ADDRESS;
    const swapParams = encodeAbiParameters(SWAP_PARAMS_ABI, [
      {
        poolKey: { currency0: ZERO_ADDRESS, currency1: meta.currency1, fee: raw.pool.fee, tickSpacing: raw.pool.tickSpacing, hooks: ZERO_ADDRESS },
        zeroForOne: meta.nativeIn,
        amountIn,
        amountOutMinimum: minOut,
        hookData: "0x",
      },
    ]);
    const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
    const take = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [currencyOut, ctx.recipient, OPEN_DELTA]);
    const actions = encodePacked(["uint8", "uint8", "uint8"], [ACTION_SWAP_EXACT_IN_SINGLE, ACTION_SETTLE_ALL, ACTION_TAKE]);
    const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swapParams, settle, take]]);
    const deadline = BigInt(Math.floor(edge.quote.expiresAt / 1000) + 120);
    const data = encodeFunctionData({ abi: universalRouterAbi, functionName: "execute", args: [COMMAND_V4_SWAP, [input], deadline] });

    steps.push({
      id: stepId(edge.id, "swap"),
      type: "SWAP",
      chainId: meta.chainId,
      provider: "uniswap-v4",
      edgeId: edge.id,
      label: `Swap ${fromAsset.symbol} on Uniswap v4 (${poolLabel(raw.pool)})`,
      status: "PENDING",
      simulate: true,
      summary: `UniversalRouter.execute(V4_SWAP: ${amountIn} units of ${fromAsset.symbol} → at least ${minOut} units out, recipient ${ctx.recipient}${meta.nativeIn ? `, msg.value ${amountIn}` : ""})`,
      expiresAt: edge.quote.expiresAt + 120_000,
      tx: { chainId: meta.chainId, to: meta.universalRouter, value: meta.nativeIn ? amountIn : 0n, data },
    });
    return steps;
  },

  async status() {
    return { kind: "COMPLETED" };
  },
};
