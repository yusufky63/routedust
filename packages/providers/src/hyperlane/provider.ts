import { erc20Abi, parseAbi, encodeFunctionData, type PublicClient } from "viem";
import {
  nodeFromAsset,
  type Address,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { HYPERLANE_REGISTRY_RAW, HYPERLANE_WARP_ROUTES, SOURCES, usdcAsset, type HyperlaneWarpRoute, type HyperlaneWarpToken } from "@testnet-router/registry";
import { TtlCache, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, runtimeSource, stepId, toBytes32Address } from "../shared";

const routerAbi = parseAbi([
  "function routers(uint32 domain) view returns (bytes32)",
  "function wrappedToken() view returns (address)",
  "function quoteGasPayment(uint32 destination) view returns (uint256)",
  "function quoteTransferRemote(uint32 destination, bytes32 recipient, uint256 amount) view returns ((address token, uint256 amount)[])",
  "function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32)",
]);

const QUOTE_TTL_MS = 2 * 60_000;
/** Router connections rarely change: verify once per session window. */
const linkCache = new TtlCache<boolean>(15 * 60_000);

interface WarpMeta {
  routeId: string;
  fromChainId: number;
  toChainId: number;
  router: Address;
  destinationDomain: number;
  collateral: Address;
  toToken: Address;
  fast: boolean;
}

interface FeeQuote {
  /** Interchain gas payment in source native wei (msg.value). */
  nativeFee: bigint;
  /** Fee charged in collateral units on top of the amount. */
  tokenFee: bigint;
}

async function verifyLink(client: PublicClient, from: HyperlaneWarpToken, to: HyperlaneWarpToken): Promise<boolean> {
  return linkCache.get(`${from.chainId}:${from.router}>${to.domain}`, async () => {
    const [remote, wrapped] = await Promise.all([
      client.readContract({ address: from.router, abi: routerAbi, functionName: "routers", args: [to.domain] }),
      client.readContract({ address: from.router, abi: routerAbi, functionName: "wrappedToken" }),
    ]);
    const expected = toBytes32Address(to.router).toLowerCase();
    return remote.toLowerCase() === expected && wrapped.toLowerCase() === from.collateral.toLowerCase();
  });
}

async function quoteFees(client: PublicClient, meta: WarpMeta, recipient: Address, amount: bigint): Promise<FeeQuote> {
  try {
    const quotes = await client.readContract({
      address: meta.router,
      abi: routerAbi,
      functionName: "quoteTransferRemote",
      args: [meta.destinationDomain, toBytes32Address(recipient), amount],
    });
    let nativeFee = 0n;
    let tokenFee = 0n;
    for (const q of quotes) {
      if (q.token === ZERO_ADDRESS) nativeFee += q.amount;
      else if (q.token.toLowerCase() === meta.collateral.toLowerCase() && q.amount !== amount) tokenFee += q.amount;
    }
    return { nativeFee, tokenFee };
  } catch {
    const nativeFee = await client.readContract({ address: meta.router, abi: routerAbi, functionName: "quoteGasPayment", args: [meta.destinationDomain] });
    return { nativeFee, tokenFee: 0n };
  }
}

function routeLabel(route: HyperlaneWarpRoute): string {
  return route.id.includes("fast") ? "CCTP v2 fast" : route.id.includes("v2") ? "CCTP v2" : "CCTP";
}

/**
 * Hyperlane USDC warp routes backed by Circle CCTP. The Hyperlane relayer
 * submits the destination mint, so no destination gas is needed; the
 * interchain gas payment is quoted on-chain and paid with the burn.
 */
export const hyperlaneProvider: RouteProvider = {
  key: "hyperlane",
  name: "Hyperlane warp (CCTP)",
  source: SOURCES.hyperlaneRegistry,

  async discover(ctx) {
    const known = new Set(ctx.chains.map((c) => c.id));
    const edges: CapabilityEdge[] = [];
    for (const route of HYPERLANE_WARP_ROUTES) {
      const tokens = route.tokens.filter((t) => known.has(t.chainId));
      for (const from of tokens) {
        if (ctx.sourceChainIds && !ctx.sourceChainIds.includes(from.chainId)) continue;
        const fromAsset = usdcAsset(from.chainId);
        if (!fromAsset?.address || fromAsset.address.toLowerCase() !== from.collateral.toLowerCase()) continue;
        const client = ctx.clients.get(from.chainId);
        for (const to of tokens) {
          if (to.chainId === from.chainId) continue;
          const toAsset = usdcAsset(to.chainId);
          if (!toAsset?.address) continue;
          let linked = false;
          try {
            linked = await verifyLink(client, from, to);
          } catch {
            linked = false;
          }
          if (!linked) continue;
          const fromNode = nodeFromAsset(fromAsset);
          const toNode = nodeFromAsset(toAsset);
          const fast = route.id.includes("fast");
          const meta: WarpMeta = {
            routeId: route.id,
            fromChainId: from.chainId,
            toChainId: to.chainId,
            router: from.router,
            destinationDomain: to.domain,
            collateral: from.collateral,
            toToken: toAsset.address,
            fast,
          };
          edges.push({
            id: edgeId("hyperlane", "HYPERLANE_WARP", fromNode, toNode, route.id),
            provider: "hyperlane",
            type: "HYPERLANE_WARP",
            from: fromNode,
            to: toNode,
            crossChain: true,
            requiresApproval: true,
            requiresSourceGas: true,
            requiresDestinationGas: false,
            outputCanonicality: "CANONICAL",
            reliabilityClass: "BEST_EFFORT_TESTNET",
            baselineGasUnits: 320_000n,
            baselineSeconds: fast ? 90 : from.chainId === 11155111 ? 20 * 60 : 5 * 60,
            source: runtimeSource(`${HYPERLANE_REGISTRY_RAW}/${route.configFile}`, `${route.name}; routers(${to.domain}) and wrappedToken() verified on chain ${from.chainId}`),
            trustMetadata: { sourceRegistry: "Hyperlane registry", registryProvenance: "official-registry" },
            meta: meta as unknown as Record<string, unknown>,
          });
        }
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as WarpMeta;
    const client = req.clients.get(meta.fromChainId);
    let fees: FeeQuote;
    try {
      fees = await quoteFees(client, meta, req.recipient, req.amountIn);
    } catch {
      return null;
    }
    if (fees.tokenFee >= req.amountIn) return null;
    const amountOut = req.amountIn - fees.tokenFee;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `${routeLabel(HYPERLANE_WARP_ROUTES.find((r) => r.id === meta.routeId) ?? HYPERLANE_WARP_ROUTES[0]!)} · relayer mints on destination · gas payment ${fees.nativeFee} wei`,
      quote: {
        provider: "hyperlane",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: amountOut,
        feeOut: fees.tokenFee,
        estimatedGasUnits: 320_000n,
        nativeFeeWei: fees.nativeFee,
        estimatedSeconds: req.edge.baselineSeconds,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: { nativeFee: fees.nativeFee.toString(), tokenFee: fees.tokenFee.toString() },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as WarpMeta;
    const client = ctx.clients.get(meta.fromChainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const steps: ExecutionStep[] = [];
    // Re-quote at build time: the gas payment moves with destination gas prices.
    const fees = await quoteFees(client, meta, ctx.recipient, ctx.amountIn);
    const amount = ctx.amountIn - fees.tokenFee;
    if (amount <= 0n) throw new Error("Hyperlane fee exceeds the amount");

    const approve = await approvalStepIfNeeded({
      client,
      chainId: meta.fromChainId,
      token: meta.collateral,
      owner: ctx.wallet,
      spender: meta.router,
      amount: ctx.amountIn,
      provider: "hyperlane",
      edgeId: edge.id,
      symbol: fromAsset.symbol,
    });
    if (approve) steps.push(approve);

    const dst = ctx.clients.get(meta.toChainId);
    const balanceBefore = await dst.readContract({ address: meta.toToken, abi: erc20Abi, functionName: "balanceOf", args: [ctx.recipient] });
    steps.push({
      id: stepId(edge.id, "transfer"),
      type: "BRIDGE",
      chainId: meta.fromChainId,
      provider: "hyperlane",
      edgeId: edge.id,
      label: `Hyperlane transferRemote → domain ${meta.destinationDomain}`,
      status: "PENDING",
      simulate: true,
      expiresAt: edge.quote.expiresAt,
      tx: {
        chainId: meta.fromChainId,
        to: meta.router,
        value: fees.nativeFee,
        data: encodeFunctionData({ abi: routerAbi, functionName: "transferRemote", args: [meta.destinationDomain, toBytes32Address(ctx.recipient), amount] }),
      },
    });
    steps.push({
      id: stepId(edge.id, "deliver"),
      type: "WAIT_ATTESTATION",
      chainId: meta.toChainId,
      provider: "hyperlane",
      edgeId: edge.id,
      label: "Hyperlane relayer delivery",
      status: "PENDING",
      pollIntervalMs: 10_000,
      poll: { destBalanceBefore: balanceBefore.toString(), expectedOut: amount.toString() },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as WarpMeta;
    const poll = (exec.poll ?? {}) as { destBalanceBefore?: string; expectedOut?: string };
    const dst = exec.clients.get(meta.toChainId);
    const balance = await dst.readContract({ address: meta.toToken, abi: erc20Abi, functionName: "balanceOf", args: [exec.wallet] });
    const expected = poll.expectedOut ? BigInt(poll.expectedOut) : 0n;
    if (poll.destBalanceBefore !== undefined && expected > 0n) {
      const delta = balance - BigInt(poll.destBalanceBefore);
      if (delta >= (expected * 95n) / 100n) return { kind: "FILLED", detail: "Destination USDC balance increased", amountOut: delta };
    }
    return { kind: "PENDING", detail: "Waiting for the Hyperlane relayer (CCTP attestation, then mint)" };
  },
};
