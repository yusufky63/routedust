import { encodeFunctionData, parseAbi, type PublicClient } from "viem";
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
  type SourceProvenance,
} from "@testnet-router/core";
import { SOURCES, V2_AMM_DEPLOYMENTS, nativeAsset, usdcAsset, wrappedNative } from "@testnet-router/registry";
import { TtlCache, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, fetchJson, runtimeSource, stepId } from "../shared";
import { UNISWAP_DEPLOYMENTS_FEED_URL, parseUniswapFeed, type UniswapFeedDeployment } from "../uniswap/feed";

const factoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
const pairAbi = parseAbi(["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"]);
const routerAbi = parseAbi([
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);
/** Pangolin / LFJ style routers name the wrapped native differently but keep the Uniswap v2 selectors otherwise. */
const avaxRouterAbi = parseAbi([
  "function WAVAX() view returns (address)",
  "function swapExactAVAXForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForAVAX(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

const QUOTE_TTL_MS = 45_000;
const feedCache = new TtlCache<Map<number, UniswapFeedDeployment>>(15 * 60_000);

interface V2Meta {
  chainId: number;
  dex: string;
  dexName: string;
  router: Address;
  pair: Address;
  tokenIn: Address;
  tokenOut: Address;
  nativeIn: boolean;
  nativeOut: boolean;
  feeBps: number;
  /** Native selectors: Uniswap (ETH) or Avalanche forks (AVAX). */
  nativeSelector: "eth" | "avax";
}

interface Deployment {
  key: string;
  name: string;
  chainId: number;
  factory: Address;
  router: Address;
  weth: Address;
  feeBps: number;
  nativeSelector: "eth" | "avax";
  source: SourceProvenance;
}

async function resolve(ctx: Parameters<RouteProvider["discover"]>[0]): Promise<Deployment[]> {
  const out: Deployment[] = [];
  const feedUrl = ctx.feeds?.uniswapDeployments ?? UNISWAP_DEPLOYMENTS_FEED_URL;
  let feed: Map<number, UniswapFeedDeployment> | undefined;
  try {
    feed = await feedCache.get(feedUrl, async () => parseUniswapFeed(await fetchJson<unknown>(ctx.fetch, feedUrl, undefined, 30_000)).deployments);
  } catch {
    feed = undefined;
  }
  for (const chain of ctx.chains) {
    const fd = feed?.get(chain.id);
    if (fd?.v2Factory && fd.v2Router) {
      const client = ctx.clients.get(chain.id);
      let weth: Address | undefined;
      try {
        weth = await client.readContract({ address: fd.v2Router, abi: routerAbi, functionName: "WETH" });
      } catch {
        weth = chain.nativeAsset.wrappedAddress;
      }
      if (weth && weth !== ZERO_ADDRESS) {
        const check = await verifyErc20(client, weth);
        if (check.hasCode) {
          out.push({ key: "uniswap-v2", name: "Uniswap v2", chainId: chain.id, factory: fd.v2Factory, router: fd.v2Router, weth, feeBps: 30, nativeSelector: "eth", source: runtimeSource(feedUrl, `v2 factory/router from the deployments feed (${fd.tier ?? "unknown tier"})`) });
        }
      }
    }
    for (const amm of V2_AMM_DEPLOYMENTS.filter((a) => a.chainId === chain.id)) {
      const client = ctx.clients.get(chain.id);
      // Sanity: the router must report the wrapped native we expect (Uniswap or Avalanche naming).
      let reported: Address | undefined;
      let selector: "eth" | "avax" = "eth";
      try {
        reported = await client.readContract({ address: amm.router, abi: routerAbi, functionName: "WETH" });
      } catch {
        try {
          reported = await client.readContract({ address: amm.router, abi: avaxRouterAbi, functionName: "WAVAX" });
          selector = "avax";
        } catch {
          reported = undefined;
        }
      }
      if (!reported || reported.toLowerCase() !== amm.wrappedNative.toLowerCase()) continue;
      out.push({ key: amm.key, name: amm.name, chainId: chain.id, factory: amm.factory, router: amm.router, weth: amm.wrappedNative, feeBps: amm.feeBps, nativeSelector: selector, source: amm.source });
    }
  }
  return out;
}

async function reserves(client: PublicClient, pair: Address, tokenIn: Address): Promise<{ reserveIn: bigint; reserveOut: bigint }> {
  const [r0, r1] = await client.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" });
  const token0 = await client.readContract({ address: pair, abi: pairAbi, functionName: "token0" });
  const inIs0 = token0.toLowerCase() === tokenIn.toLowerCase();
  return { reserveIn: inIs0 ? r0 : r1, reserveOut: inIs0 ? r1 : r0 };
}

/**
 * Constant-product (Uniswap v2 style) pools: Uniswap v2 where the feed lists
 * a deployment, plus registry-listed compatible AMMs (Pangolin, LFJ on Fuji).
 * Only wrapped-native/USDC pairs with reserves on both sides become edges.
 */
export const uniswapV2Provider: RouteProvider = {
  key: "uniswap-v2",
  name: "Uniswap v2 · v2-style AMMs",
  source: SOURCES.uniswapFeed,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    for (const d of await resolve(ctx)) {
      const usdc = usdcAsset(d.chainId);
      const native = nativeAsset(d.chainId);
      const registryWrapped = wrappedNative(d.chainId);
      const wrapped = registryWrapped?.address?.toLowerCase() === d.weth.toLowerCase() ? registryWrapped : undefined;
      if (!usdc?.address || native.kind !== "NATIVE") continue;
      const client = ctx.clients.get(d.chainId);
      let pair: Address;
      try {
        pair = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "getPair", args: [d.weth, usdc.address] });
      } catch {
        continue;
      }
      if (pair === ZERO_ADDRESS) continue;
      const r = await reserves(client, pair, d.weth).catch(() => undefined);
      if (!r || r.reserveIn === 0n || r.reserveOut === 0n) continue;
      // The quote path must work end to end, otherwise the pair is not usable.
      try {
        const probe = await client.readContract({ address: d.router, abi: routerAbi, functionName: "getAmountsOut", args: [10n ** 14n, [d.weth, usdc.address]] });
        if ((probe[1] ?? 0n) === 0n) continue;
      } catch {
        continue;
      }
      const source = runtimeSource(d.source.url, `${d.name}: pair ${pair}, reserves ${r.reserveIn} wrapped-native wei / ${r.reserveOut} USDC units`);
      const suffix = d.key === "uniswap-v2" ? undefined : d.key;
      const mk = (from: Asset, to: Asset, nativeIn: boolean, nativeOut: boolean): CapabilityEdge => {
        const fromNode = nodeFromAsset(from);
        const toNode = nodeFromAsset(to);
        const meta: V2Meta = {
          chainId: d.chainId,
          dex: d.key,
          dexName: d.name,
          router: d.router,
          pair,
          tokenIn: nativeIn ? d.weth : (from.address as Address),
          tokenOut: nativeOut ? d.weth : (to.address as Address),
          nativeIn,
          nativeOut,
          feeBps: d.feeBps,
          nativeSelector: d.nativeSelector,
        };
        return {
          id: edgeId("uniswap-v2", "SWAP", fromNode, toNode, suffix),
          provider: "uniswap-v2",
          type: "SWAP",
          from: fromNode,
          to: toNode,
          crossChain: false,
          requiresApproval: !nativeIn,
          requiresSourceGas: true,
          requiresDestinationGas: false,
          outputCanonicality: to.representation === "WRAPPED_NATIVE" ? "WRAPPED" : to.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
          reliabilityClass: "LIQUIDITY",
          baselineGasUnits: 160_000n,
          baselineSeconds: 20,
          source,
          trustMetadata: { sourceRegistry: d.name },
          meta: meta as unknown as Record<string, unknown>,
        };
      };
      edges.push(mk(native, usdc, true, false), mk(usdc, native, false, true));
      if (wrapped) edges.push(mk(wrapped, usdc, false, false), mk(usdc, wrapped, false, false));
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as V2Meta;
    const client = req.clients.get(meta.chainId);
    let amountOut: bigint;
    try {
      const amounts = await client.readContract({ address: meta.router, abi: routerAbi, functionName: "getAmountsOut", args: [req.amountIn, [meta.tokenIn, meta.tokenOut]] });
      amountOut = amounts[1] ?? 0n;
    } catch {
      return null;
    }
    if (amountOut <= 0n) return null;
    // Exact constant-product impact: effective price vs marginal (reserve) price.
    let impact: number | undefined;
    try {
      const r = await reserves(client, meta.pair, meta.tokenIn);
      const effOverMarginal = ratio(amountOut * r.reserveIn, r.reserveOut * req.amountIn);
      impact = Math.max(0, Math.round((1 - effOverMarginal) * 10_000));
    } catch {
      impact = undefined;
    }
    const label = `${meta.dexName} pair · fee ${(meta.feeBps / 100).toFixed(2)}%`;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: impact !== undefined ? `${label} · impact ${(impact / 100).toFixed(2)}%` : label,
      quote: {
        provider: "uniswap-v2",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: applyBps(amountOut, req.slippageBps),
        feeOut: (amountOut * BigInt(meta.feeBps)) / 10_000n,
        estimatedGasUnits: 160_000n,
        estimatedSeconds: 20,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        priceImpactBps: impact,
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as V2Meta;
    const client = ctx.clients.get(meta.chainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const amountIn = ctx.amountIn;
    const minOut = amountIn === edge.quote.amountIn ? edge.quote.minAmountOut : applyBps((edge.quote.amountOut * amountIn) / edge.quote.amountIn, 100);
    const steps: ExecutionStep[] = [];
    if (!meta.nativeIn) {
      const approve = await approvalStepIfNeeded({
        client,
        chainId: meta.chainId,
        token: meta.tokenIn,
        owner: ctx.wallet,
        spender: meta.router,
        amount: amountIn,
        provider: "uniswap-v2",
        edgeId: edge.id,
        symbol: fromAsset.symbol,
      });
      if (approve) steps.push(approve);
    }
    const deadline = BigInt(Math.floor(edge.quote.expiresAt / 1000) + 120);
    const path = [meta.tokenIn, meta.tokenOut];
    const avax = meta.nativeSelector === "avax";
    const data = meta.nativeIn
      ? avax
        ? encodeFunctionData({ abi: avaxRouterAbi, functionName: "swapExactAVAXForTokens", args: [minOut, path, ctx.recipient, deadline] })
        : encodeFunctionData({ abi: routerAbi, functionName: "swapExactETHForTokens", args: [minOut, path, ctx.recipient, deadline] })
      : meta.nativeOut
        ? avax
          ? encodeFunctionData({ abi: avaxRouterAbi, functionName: "swapExactTokensForAVAX", args: [amountIn, minOut, path, ctx.recipient, deadline] })
          : encodeFunctionData({ abi: routerAbi, functionName: "swapExactTokensForETH", args: [amountIn, minOut, path, ctx.recipient, deadline] })
        : encodeFunctionData({ abi: routerAbi, functionName: "swapExactTokensForTokens", args: [amountIn, minOut, path, ctx.recipient, deadline] });
    steps.push({
      id: stepId(edge.id, "swap"),
      type: "SWAP",
      chainId: meta.chainId,
      provider: "uniswap-v2",
      edgeId: edge.id,
      label: `Swap ${fromAsset.symbol} on ${meta.dexName}`,
      status: "PENDING",
      simulate: true,
      summary: `${meta.dexName} router: ${amountIn} units of ${fromAsset.symbol} → at least ${minOut} units out, recipient ${ctx.recipient}, deadline ${deadline}`,
      expiresAt: edge.quote.expiresAt + 120_000,
      tx: { chainId: meta.chainId, to: meta.router, value: meta.nativeIn ? amountIn : 0n, data },
    });
    return steps;
  },

  async status() {
    return { kind: "COMPLETED" };
  },
};
