import { encodeFunctionData, encodePacked, parseAbi, type PublicClient } from "viem";
import {
  applyBps,
  nodeFromAsset,
  ratio,
  verifyErc20,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { UNISWAP_V3_DEPLOYMENTS, nativeAsset, uniswapDeploymentFor, usdcAsset, wrappedNative, type UniswapV3Deployment } from "@testnet-router/registry";
import { TtlCache, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, fetchJson, runtimeSource, stepId } from "../shared";
import { UNISWAP_DEPLOYMENTS_FEED_URL, hasV3Swap, parseUniswapFeed, type UniswapFeedDeployment } from "./feed";

const factoryAbi = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const poolAbi = parseAbi(["function liquidity() view returns (uint128)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
]);
const weth9Abi = parseAbi(["function WETH9() view returns (address)"]);

/** SwapRouter02 sentinel: keep output inside the router for a follow-up unwrap. */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;
const PROBE_AMOUNT = 10n ** 14n; // 0.0001 of an 18-decimal asset
const QUOTE_TTL_MS = 45_000;
const PROBE_TTL_MS = 5 * 60_000;
const MAX_EXTRA_TOKENS = 60;
const MAX_TOKEN_PROBES = 120;

const feedCache = new TtlCache<Map<number, UniswapFeedDeployment>>(15 * 60_000);
/** Token pool probes are expensive and rarely change: cache per chain + token set. */
const tokenPoolCache = new TtlCache<TokenPoolResult[]>(PROBE_TTL_MS);
/** Marginal-price probes for price impact, per edge + route. */
const marginalCache = new TtlCache<bigint | null>(60_000);

interface Hop {
  /** Intermediate token (WETH9) for two-hop routes. */
  via: Address;
  /** Live fee tiers for tokenIn -> via. */
  feesA: number[];
  /** Live fee tiers for via -> tokenOut. */
  feesB: number[];
}

interface SwapMeta {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  nativeIn: boolean;
  nativeOut: boolean;
  /** Single-hop fee tiers with live pools (empty for two-hop edges). */
  feeTiers: number[];
  pools: Record<number, Address>;
  hop?: Hop;
  router: Address;
  quoter: Address;
}

interface LivePool {
  fee: number;
  pool: Address;
  liquidity: bigint;
}

interface TokenPoolResult {
  token: Asset;
  viaUsdc: { sell: LivePool[]; buy: LivePool[] };
  viaWeth: { sell: LivePool[]; buy: LivePool[] };
}

/** A deployment ready for pool probing: static registry entry or feed entry with WETH9 resolved on-chain. */
type ResolvedDeployment = Omit<UniswapV3Deployment, "universalRouter" | "permit2"> & {
  universalRouter?: Address;
  permit2?: Address;
  origin: "registry" | "feed";
};

type Route =
  | { kind: "single"; fee: number }
  | { kind: "hop"; feeA: number; feeB: number }
  /** Input split across two fee tiers in one transaction; shareA is the bps share sent to feeA. */
  | { kind: "split"; feeA: number; feeB: number; shareA: number };

/** Splits are only worth their extra quotes when the best single pool shows real impact. */
const SPLIT_MIN_IMPACT_BPS = 30;
const SPLIT_SHARES = [3000, 5000, 7000];

function splitAmounts(amountIn: bigint, shareA: number): { inA: bigint; inB: bigint } {
  const inA = (amountIn * BigInt(shareA)) / 10_000n;
  return { inA, inB: amountIn - inA };
}

/* ---------------- deployments ---------------- */

async function resolveDeployments(
  ctx: Parameters<RouteProvider["discover"]>[0],
): Promise<{ deployments: ResolvedDeployment[]; feedUrl: string; feedOk: boolean }> {
  const feedUrl = ctx.feeds?.uniswapDeployments ?? UNISWAP_DEPLOYMENTS_FEED_URL;
  let feed: Map<number, UniswapFeedDeployment> | undefined;
  try {
    feed = await feedCache.get(feedUrl, async () => parseUniswapFeed(await fetchJson<unknown>(ctx.fetch, feedUrl, undefined, 30_000)).deployments);
  } catch {
    feed = undefined;
  }
  const deployments: ResolvedDeployment[] = [];
  for (const chain of ctx.chains) {
    const fixed = uniswapDeploymentFor(chain.id);
    if (fixed) {
      deployments.push({ ...fixed, origin: "registry" });
      continue;
    }
    const fd = feed?.get(chain.id);
    if (!hasV3Swap(fd)) continue;
    const client = ctx.clients.get(chain.id);
    // The feed does not carry WETH9; the router knows it. Verify it is a real token.
    let weth9: Address | undefined;
    try {
      weth9 = await client.readContract({ address: fd.swapRouter02, abi: weth9Abi, functionName: "WETH9" });
    } catch {
      weth9 = chain.nativeAsset.wrappedAddress;
    }
    if (!weth9 || weth9 === ZERO_ADDRESS) continue;
    const check = await verifyErc20(client, weth9);
    if (!check.hasCode || check.decimals !== chain.nativeAsset.decimals) continue;
    deployments.push({
      chainId: chain.id,
      factory: fd.factory,
      quoterV2: fd.quoterV2,
      swapRouter02: fd.swapRouter02,
      universalRouter: fd.universalRouter,
      permit2: fd.permit2,
      weth9,
      feeTiers: [500, 3000, 10000],
      origin: "feed",
      source: runtimeSource(feedUrl, `Uniswap deployments feed (${fd.tier ?? "unknown tier"}); WETH9 ${weth9} (${check.symbol ?? "?"}) resolved from SwapRouter02`),
    });
  }
  return { deployments, feedUrl, feedOk: Boolean(feed) };
}

/* ---------------- pools & quotes ---------------- */

async function livePools(
  client: PublicClient,
  d: Pick<UniswapV3Deployment, "factory" | "feeTiers">,
  tokenA: Address,
  tokenB: Address,
): Promise<LivePool[]> {
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

function encodePath(tokens: Address[], fees: number[]): `0x${string}` {
  const types: ("address" | "uint24")[] = [];
  const values: (Address | number)[] = [];
  tokens.forEach((t, i) => {
    types.push("address");
    values.push(t);
    const fee = fees[i];
    if (i < tokens.length - 1 && fee !== undefined) {
      types.push("uint24");
      values.push(fee);
    }
  });
  return encodePacked(types, values);
}

async function quotePath(
  client: PublicClient,
  quoter: Address,
  path: `0x${string}`,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const { result } = await client.simulateContract({ address: quoter, abi: quoterAbi, functionName: "quoteExactInput", args: [path, amountIn] });
    return { amountOut: result[0], gasEstimate: result[3] };
  } catch {
    return null;
  }
}

async function quoteRoute(client: PublicClient, meta: SwapMeta, route: Route, amountIn: bigint) {
  if (route.kind === "single") return quoteSingle(client, meta.quoter, meta.tokenIn, meta.tokenOut, amountIn, route.fee);
  if (route.kind === "split") {
    const { inA, inB } = splitAmounts(amountIn, route.shareA);
    if (inA <= 0n || inB <= 0n) return null;
    const [a, b] = await Promise.all([
      quoteSingle(client, meta.quoter, meta.tokenIn, meta.tokenOut, inA, route.feeA),
      quoteSingle(client, meta.quoter, meta.tokenIn, meta.tokenOut, inB, route.feeB),
    ]);
    if (!a || !b) return null;
    return { amountOut: a.amountOut + b.amountOut, gasEstimate: a.gasEstimate + b.gasEstimate };
  }
  const hop = meta.hop as Hop;
  return quotePath(client, meta.quoter, encodePath([meta.tokenIn, hop.via, meta.tokenOut], [route.feeA, route.feeB]), amountIn);
}

function routesOf(meta: SwapMeta): Route[] {
  if (meta.hop) {
    const out: Route[] = [];
    for (const feeA of meta.hop.feesA) for (const feeB of meta.hop.feesB) out.push({ kind: "hop", feeA, feeB });
    return out;
  }
  return meta.feeTiers.map((fee) => ({ kind: "single", fee }));
}

function routeKey(route: Route): string {
  if (route.kind === "single") return `s${route.fee}`;
  if (route.kind === "split") return `p${route.feeA}-${route.feeB}-${route.shareA}`;
  return `h${route.feeA}-${route.feeB}`;
}

function routeFeeBps(route: Route): number {
  if (route.kind === "single") return route.fee;
  if (route.kind === "split") return Math.round((route.feeA * route.shareA + route.feeB * (10_000 - route.shareA)) / 10_000);
  return route.feeA + route.feeB;
}

function routeLabel(route: Route, meta: SwapMeta): string {
  if (route.kind === "single") return `pool ${meta.pools[route.fee]} fee ${route.fee / 10_000}%`;
  if (route.kind === "split") return `split ${route.shareA / 100}/${100 - route.shareA / 100} across ${route.feeA / 10_000}% + ${route.feeB / 10_000}% pools, one tx`;
  return `via WETH ${route.feeA / 10_000}% + ${route.feeB / 10_000}%, one tx`;
}

/**
 * Price impact = 1 - (effective price / marginal price), where the marginal
 * price comes from a tiny probe quote on the same route (cached briefly).
 */
async function priceImpact(client: PublicClient, edgeIdValue: string, meta: SwapMeta, route: Route, amountIn: bigint, amountOut: bigint): Promise<number | undefined> {
  const probeIn = amountIn / 1000n;
  if (probeIn <= 0n || amountOut <= 0n) return undefined;
  const key = `${edgeIdValue}|${routeKey(route)}|${probeIn}`;
  const probeOut = await marginalCache.get(key, async () => (await quoteRoute(client, meta, route, probeIn))?.amountOut ?? null);
  if (!probeOut || probeOut <= 0n) return undefined;
  const effectiveOverMarginal = ratio(amountOut * probeIn, probeOut * amountIn);
  return Math.max(0, Math.round((1 - effectiveOverMarginal) * 10_000));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

/**
 * For arbitrary ERC-20s: one multicall for every (token, counter-asset, fee)
 * pool lookup, one for liquidity, then bounded quote probes in both directions.
 */
async function tokenPools(client: PublicClient, d: ResolvedDeployment, tokens: Asset[], usdc: Address): Promise<TokenPoolResult[]> {
  const counters: { key: "viaUsdc" | "viaWeth"; address: Address; probeIn: bigint }[] = [
    { key: "viaUsdc", address: usdc, probeIn: 100_000n }, // 0.1 USDC
    { key: "viaWeth", address: d.weth9, probeIn: 10n ** 14n }, // 0.0001 ETH-like
  ];
  const lookups: { token: Asset; counter: (typeof counters)[number]; fee: number }[] = [];
  for (const token of tokens) for (const counter of counters) for (const fee of d.feeTiers) lookups.push({ token, counter, fee });

  const pools = await client.multicall({
    contracts: lookups.map((l) => ({
      address: d.factory,
      abi: factoryAbi,
      functionName: "getPool" as const,
      args: [l.token.address as Address, l.counter.address, l.fee] as const,
    })),
    allowFailure: true,
  });
  const existing = lookups
    .map((l, i) => ({ ...l, pool: pools[i]?.status === "success" ? (pools[i]?.result as Address) : ZERO_ADDRESS }))
    .filter((l) => l.pool !== ZERO_ADDRESS);
  if (existing.length === 0) return [];

  const liquidity = await client.multicall({
    contracts: existing.map((l) => ({ address: l.pool, abi: poolAbi, functionName: "liquidity" as const })),
    allowFailure: true,
  });
  // Probe the deepest pools first so the cap never hides a real market behind spam pools.
  const live = existing
    .map((l, i) => ({ ...l, liquidity: liquidity[i]?.status === "success" ? (liquidity[i]?.result as bigint) : 0n }))
    .filter((l) => l.liquidity > 0n)
    .sort((a, b) => (b.liquidity > a.liquidity ? 1 : b.liquidity < a.liquidity ? -1 : 0))
    .slice(0, MAX_TOKEN_PROBES);

  const results = new Map<string, TokenPoolResult>();
  const ensure = (token: Asset) => {
    let r = results.get(token.id);
    if (!r) {
      r = { token, viaUsdc: { sell: [], buy: [] }, viaWeth: { sell: [], buy: [] } };
      results.set(token.id, r);
    }
    return r;
  };

  await mapLimit(live, 8, async (l) => {
    const tokenAddr = l.token.address as Address;
    const oneToken = 10n ** BigInt(l.token.decimals);
    const [sell, buy] = await Promise.all([
      quoteSingle(client, d.quoterV2, tokenAddr, l.counter.address, oneToken, l.fee),
      quoteSingle(client, d.quoterV2, l.counter.address, tokenAddr, l.counter.probeIn, l.fee),
    ]);
    const entry = ensure(l.token)[l.counter.key];
    const pool: LivePool = { fee: l.fee, pool: l.pool, liquidity: l.liquidity };
    if (sell && sell.amountOut > 0n) entry.sell.push(pool);
    if (buy && buy.amountOut > 0n) entry.buy.push(pool);
  });
  return [...results.values()];
}

/* ---------------- provider ---------------- */

/**
 * Uniswap v3 same-chain swaps. Edges exist only after: deployment -> pool
 * exists -> non-zero liquidity -> probe quote succeeds (spec section 6.1).
 * Two-hop routes through WETH are single transactions (exactInput path).
 */
export const uniswapProvider: RouteProvider = {
  key: "uniswap",
  name: "Uniswap v3",
  source: UNISWAP_V3_DEPLOYMENTS[0]?.source ?? runtimeSource("https://developers.uniswap.org"),

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    const { deployments } = await resolveDeployments(ctx);
    for (const d of deployments) {
      const usdc = usdcAsset(d.chainId);
      const native = nativeAsset(d.chainId);
      const registryWrapped = wrappedNative(d.chainId);
      const wrapped = registryWrapped?.address?.toLowerCase() === d.weth9.toLowerCase() ? registryWrapped : undefined;
      if (!usdc?.address) continue;
      const usdcAddress = usdc.address;
      const client = ctx.clients.get(d.chainId);
      let pools: LivePool[] = [];
      try {
        pools = await livePools(client, d, d.weth9, usdcAddress);
      } catch {
        continue;
      }

      // WETH <-> USDC: probe both directions with a tiny amount; keep tiers that quote.
      const usableIn: LivePool[] = [];
      const usableOut: LivePool[] = [];
      for (const p of pools) {
        const [a, b] = await Promise.all([
          quoteSingle(client, d.quoterV2, d.weth9, usdcAddress, PROBE_AMOUNT, p.fee),
          quoteSingle(client, d.quoterV2, usdcAddress, d.weth9, 10n ** 5n, p.fee),
        ]);
        if (a && a.amountOut > 0n) usableIn.push(p);
        if (b && b.amountOut > 0n) usableOut.push(p);
      }
      const source = runtimeSource(
        d.source.url,
        `${d.origin === "feed" ? `${d.source.note ?? "deployments feed"}; ` : ""}live pool check on chain ${d.chainId}: ${pools.map((p) => `${p.fee}bps@${p.pool}`).join(", ") || "none"}`,
      );

      const mk = (from: Asset, to: Asset, tiers: LivePool[], nativeIn: boolean, nativeOut: boolean, hop?: Hop): CapabilityEdge => {
        const fromNode = nodeFromAsset(from);
        const toNode = nodeFromAsset(to);
        const meta: SwapMeta = {
          chainId: d.chainId,
          tokenIn: nativeIn ? d.weth9 : (from.address as Address),
          tokenOut: nativeOut ? d.weth9 : (to.address as Address),
          nativeIn,
          nativeOut,
          feeTiers: hop ? [] : tiers.map((t) => t.fee),
          pools: Object.fromEntries(tiers.map((t) => [t.fee, t.pool])),
          hop,
          router: d.swapRouter02,
          quoter: d.quoterV2,
        };
        return {
          id: edgeId("uniswap", "SWAP", fromNode, toNode, hop ? "via-weth" : undefined),
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
          baselineGasUnits: hop ? 280_000n : 200_000n,
          baselineSeconds: 20,
          source,
          meta: meta as unknown as Record<string, unknown>,
        };
      };

      if (usableIn.length > 0) {
        edges.push(mk(native, usdc, usableIn, true, false));
        if (wrapped) edges.push(mk(wrapped, usdc, usableIn, false, false));
      }
      if (usableOut.length > 0) {
        edges.push(mk(usdc, native, usableOut, false, true));
        if (wrapped) edges.push(mk(usdc, wrapped, usableOut, false, false));
      }

      // Other ERC-20s on this chain (wallet-discovered or user-added tokens).
      const extras = ctx.assets.filter(
        (a) =>
          a.chainId === d.chainId &&
          a.kind === "ERC20" &&
          a.address &&
          a.id !== usdc.id &&
          a.address.toLowerCase() !== d.weth9.toLowerCase() &&
          (!wrapped || a.id !== wrapped.id) &&
          a.risk?.transfer !== "blocked" &&
          a.risk?.transfer !== "fee",
      );
      if (extras.length > 0) {
        try {
          const batch = extras.slice(0, MAX_EXTRA_TOKENS);
          const cacheKey = `${d.chainId}|${batch
            .map((a) => a.id)
            .sort()
            .join(",")}`;
          const found = await tokenPoolCache.get(cacheKey, () => tokenPools(client, d, batch, usdcAddress));
          for (const { token, viaUsdc, viaWeth } of found) {
            // Direct pools.
            if (viaUsdc.sell.length > 0) edges.push(mk(token, usdc, viaUsdc.sell, false, false));
            if (viaUsdc.buy.length > 0) edges.push(mk(usdc, token, viaUsdc.buy, false, false));
            if (viaWeth.sell.length > 0) edges.push(mk(token, native, viaWeth.sell, false, true));
            if (viaWeth.buy.length > 0) edges.push(mk(native, token, viaWeth.buy, true, false));
            // Two-hop through WETH in one transaction when only the WETH pool exists.
            if (viaUsdc.sell.length === 0 && viaWeth.sell.length > 0 && usableIn.length > 0) {
              const hop: Hop = { via: d.weth9, feesA: viaWeth.sell.map((p) => p.fee), feesB: usableIn.map((p) => p.fee) };
              edges.push(mk(token, usdc, [...viaWeth.sell, ...usableIn], false, false, hop));
            }
            if (viaUsdc.buy.length === 0 && viaWeth.buy.length > 0 && usableOut.length > 0) {
              const hop: Hop = { via: d.weth9, feesA: usableOut.map((p) => p.fee), feesB: viaWeth.buy.map((p) => p.fee) };
              edges.push(mk(usdc, token, [...usableOut, ...viaWeth.buy], false, false, hop));
            }
          }
        } catch {
          // token probing is best effort; core edges above are already in place
        }
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as SwapMeta;
    const client = req.clients.get(meta.chainId);
    let best: { route: Route; amountOut: bigint; gasEstimate: bigint } | null = null;
    const singles: { route: Route & { kind: "single" }; amountOut: bigint }[] = [];
    for (const route of routesOf(meta)) {
      const q = await quoteRoute(client, meta, route, req.amountIn);
      if (!q) continue;
      if (route.kind === "single") singles.push({ route, amountOut: q.amountOut });
      if (!best || q.amountOut > best.amountOut) best = { route, ...q };
    }
    if (!best || best.amountOut === 0n) return null;
    let impact = await priceImpact(client, req.edge.id, meta, best.route, req.amountIn, best.amountOut);

    // Large amounts: split the input between the two deepest tiers when that beats the best single pool.
    if (singles.length >= 2 && impact !== undefined && impact >= SPLIT_MIN_IMPACT_BPS) {
      const [top, second] = [...singles].sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
      if (top && second) {
        for (const shareA of SPLIT_SHARES) {
          const route: Route = { kind: "split", feeA: top.route.fee, feeB: second.route.fee, shareA };
          const q = await quoteRoute(client, meta, route, req.amountIn);
          if (q && q.amountOut > best.amountOut) best = { route, ...q };
        }
        if (best.route.kind === "split") impact = await priceImpact(client, req.edge.id, meta, best.route, req.amountIn, best.amountOut);
      }
    }
    const feeOut = (best.amountOut * BigInt(routeFeeBps(best.route))) / 1_000_000n;
    const label = routeLabel(best.route, meta);
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: impact !== undefined ? `${label} · impact ${(impact / 100).toFixed(2)}%` : label,
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
        priceImpactBps: impact,
        raw: { route: best.route, pool: best.route.kind === "single" ? meta.pools[best.route.fee] : undefined },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as SwapMeta;
    const raw = edge.quote.raw as { route: Route };
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

    const recipient = meta.nativeOut ? ADDRESS_THIS : ctx.recipient;
    const single = (fee: number, inAmount: bigint, minAmount: bigint) =>
      encodeFunctionData({
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [{ tokenIn: meta.tokenIn, tokenOut: meta.tokenOut, fee, recipient, amountIn: inAmount, amountOutMinimum: minAmount, sqrtPriceLimitX96: 0n }],
      });
    const calls: `0x${string}`[] = [];
    if (raw.route.kind === "single") {
      calls.push(single(raw.route.fee, amountIn, minOut));
    } else if (raw.route.kind === "split") {
      // Two exactInputSingle calls in one multicall; SwapRouter02 draws native input from its own balance for both.
      const { inA, inB } = splitAmounts(amountIn, raw.route.shareA);
      const minA = (minOut * inA) / amountIn;
      calls.push(single(raw.route.feeA, inA, minA), single(raw.route.feeB, inB, minOut - minA));
    } else {
      calls.push(
        encodeFunctionData({
          abi: routerAbi,
          functionName: "exactInput",
          args: [{ path: encodePath([meta.tokenIn, (meta.hop as Hop).via, meta.tokenOut], [raw.route.feeA, raw.route.feeB]), recipient, amountIn, amountOutMinimum: minOut }],
        }),
      );
    }
    if (meta.nativeOut) {
      calls.push(encodeFunctionData({ abi: routerAbi, functionName: "unwrapWETH9", args: [minOut, ctx.recipient] }));
    }
    const deadline = BigInt(Math.floor(edge.quote.expiresAt / 1000) + 120);
    const data = encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [deadline, calls] });
    const stepLabel =
      raw.route.kind === "single"
        ? `${raw.route.fee / 10_000}% pool`
        : raw.route.kind === "split"
          ? `split ${raw.route.shareA / 100}/${100 - raw.route.shareA / 100}, ${raw.route.feeA / 10_000}% + ${raw.route.feeB / 10_000}%`
          : `via WETH, ${raw.route.feeA / 10_000}% + ${raw.route.feeB / 10_000}%`;

    steps.push({
      id: stepId(edge.id, "swap"),
      type: "SWAP",
      chainId: meta.chainId,
      provider: "uniswap",
      edgeId: edge.id,
      label: `Swap ${fromAsset.symbol} on Uniswap v3 (${stepLabel})`,
      status: "PENDING",
      simulate: true,
      summary: `SwapRouter02.multicall(${calls.length} calls): ${amountIn} units of ${fromAsset.symbol} → at least ${minOut} units out${meta.nativeOut ? ", then unwrapWETH9 to " + ctx.recipient : ", recipient " + ctx.recipient}`,
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
