import { erc20Abi, type Hex } from "viem";
import {
  nodeFromAsset,
  type Address,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { SOURCES, nativeAsset, usdcAsset } from "@testnet-router/registry";
import { HttpError, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, fetchJson, runtimeSource, stepId } from "../shared";

const API = "https://li.quest/v1";
const QUOTE_TTL_MS = 2 * 60_000;

interface ToolsResponse {
  bridges?: { key: string; name: string; supportedChains: { fromChainId: number; toChainId: number }[] }[];
}

interface Quote {
  id: string;
  tool: string;
  estimate: {
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: Address;
    executionDuration?: number;
    feeCosts?: { name: string; amount: string; token?: { address: string } }[];
    gasCosts?: { estimate: string }[];
  };
  transactionRequest?: { to: Address; data: Hex; value?: string; gasLimit?: string; chainId?: number };
}

interface StatusResponse {
  status?: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  receiving?: { txHash?: Hex; amount?: string };
}

interface LifiMeta {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  nativeIn: boolean;
  nativeOut: boolean;
  tool: string;
}

/**
 * LI.FI Intents on testnets (runtime pair list from /v1/tools). Quotes come
 * from /v1/quote and are executed exactly as returned; always best effort.
 */
export const lifiProvider: RouteProvider = {
  key: "lifi",
  name: "LI.FI Intents (testnet)",
  source: SOURCES.lifiIntents,

  async discover(ctx) {
    const known = new Set(ctx.chains.map((c) => c.id));
    // No `chains=` filter: LI.FI rejects the whole request when one id is unknown to it; pairs are filtered locally.
    const tools = await fetchJson<ToolsResponse>(ctx.fetch, `${API}/tools`, undefined, 20_000);
    const edges: CapabilityEdge[] = [];
    const source = runtimeSource(`${API}/tools`, "pairs returned by LI.FI /v1/tools for the registry chains");
    for (const bridge of tools.bridges ?? []) {
      for (const pair of bridge.supportedChains) {
        if (!known.has(pair.fromChainId) || !known.has(pair.toChainId) || pair.fromChainId === pair.toChainId) continue;
        const legs: { from: ReturnType<typeof usdcAsset>; to: ReturnType<typeof usdcAsset>; native: boolean }[] = [
          { from: usdcAsset(pair.fromChainId), to: usdcAsset(pair.toChainId), native: false },
          { from: nativeAsset(pair.fromChainId), to: nativeAsset(pair.toChainId), native: true },
        ];
        for (const leg of legs) {
          if (!leg.from || !leg.to) continue;
          if (leg.native && (leg.from.canonicalAssetId !== "ETH" || leg.to.canonicalAssetId !== "ETH")) continue;
          const from = nodeFromAsset(leg.from);
          const to = nodeFromAsset(leg.to);
          const meta: LifiMeta = {
            fromChainId: pair.fromChainId,
            toChainId: pair.toChainId,
            fromToken: leg.native ? ZERO_ADDRESS : (leg.from.address as Address),
            toToken: leg.native ? ZERO_ADDRESS : (leg.to.address as Address),
            nativeIn: leg.native,
            nativeOut: leg.native,
            tool: bridge.key,
          };
          edges.push({
            id: edgeId("lifi", "LIFI", from, to, bridge.key),
            provider: "lifi",
            type: "LIFI",
            from,
            to,
            crossChain: true,
            requiresApproval: !leg.native,
            requiresSourceGas: true,
            requiresDestinationGas: false,
            outputCanonicality: leg.to.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
            reliabilityClass: "BEST_EFFORT_TESTNET",
            baselineGasUnits: 650_000n,
            baselineSeconds: 60,
            source,
            trustMetadata: { sourceRegistry: `LI.FI tool ${bridge.name}`, registryProvenance: "official-registry" },
            meta: meta as unknown as Record<string, unknown>,
          });
        }
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as LifiMeta;
    const params = new URLSearchParams({
      fromChain: String(meta.fromChainId),
      toChain: String(meta.toChainId),
      fromToken: meta.fromToken,
      toToken: meta.toToken,
      fromAmount: req.amountIn.toString(),
      fromAddress: req.wallet,
      toAddress: req.recipient,
      slippage: String(req.slippageBps / 10_000),
      allowBridges: meta.tool,
    });
    let q: Quote;
    try {
      q = await fetchJson<Quote>(req.fetch, `${API}/quote?${params.toString()}`, undefined, 25_000, 0);
    } catch (err) {
      if (err instanceof HttpError && /No available quotes/i.test(err.body)) return null;
      throw err;
    }
    if (!q.transactionRequest || !q.estimate) return null;
    const amountOut = BigInt(q.estimate.toAmount);
    if (amountOut <= 0n) return null;
    const minOut = BigInt(q.estimate.toAmountMin ?? q.estimate.toAmount);
    const gas = q.transactionRequest.gasLimit ? BigInt(q.transactionRequest.gasLimit) : 650_000n;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `${q.tool} · testnet solver, best effort`,
      quote: {
        provider: "lifi",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: minOut,
        feeOut: req.amountIn > amountOut && meta.fromToken === meta.toToken ? 0n : 0n,
        estimatedGasUnits: gas,
        estimatedSeconds: q.estimate.executionDuration ?? 60,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: {
          tx: { to: q.transactionRequest.to, data: q.transactionRequest.data, value: q.transactionRequest.value ?? "0x0", gasLimit: q.transactionRequest.gasLimit },
          approvalAddress: q.estimate.approvalAddress,
          tool: q.tool,
        },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as LifiMeta;
    const raw = edge.quote.raw as { tx: { to: Address; data: Hex; value: string; gasLimit?: string }; approvalAddress?: Address };
    const client = ctx.clients.get(meta.fromChainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const toAsset = assetById(ctx.assets, edge.to.assetId);
    const steps: ExecutionStep[] = [];
    if (!meta.nativeIn && raw.approvalAddress) {
      const approve = await approvalStepIfNeeded({
        client,
        chainId: meta.fromChainId,
        token: meta.fromToken,
        owner: ctx.wallet,
        spender: raw.approvalAddress,
        amount: ctx.amountIn,
        provider: "lifi",
        edgeId: edge.id,
        symbol: fromAsset.symbol,
      });
      if (approve) steps.push(approve);
    }
    const dst = ctx.clients.get(meta.toChainId);
    const balanceBefore =
      toAsset.kind === "NATIVE" || !toAsset.address
        ? await dst.getBalance({ address: ctx.recipient })
        : await dst.readContract({ address: toAsset.address, abi: erc20Abi, functionName: "balanceOf", args: [ctx.recipient] });
    steps.push({
      id: stepId(edge.id, "deposit"),
      type: "BRIDGE",
      chainId: meta.fromChainId,
      provider: "lifi",
      edgeId: edge.id,
      label: `LI.FI ${meta.tool} → chain ${meta.toChainId}`,
      status: "PENDING",
      simulate: true,
      expiresAt: edge.quote.expiresAt,
      tx: { chainId: meta.fromChainId, to: raw.tx.to, value: BigInt(raw.tx.value || "0x0"), data: raw.tx.data, gas: raw.tx.gasLimit ? BigInt(raw.tx.gasLimit) : undefined },
    });
    steps.push({
      id: stepId(edge.id, "fill"),
      type: "WAIT_ATTESTATION",
      chainId: meta.toChainId,
      provider: "lifi",
      edgeId: edge.id,
      label: "LI.FI solver fill",
      status: "PENDING",
      pollIntervalMs: 10_000,
      poll: { destBalanceBefore: balanceBefore.toString(), expectedOut: edge.quote.minAmountOut.toString() },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as LifiMeta;
    try {
      const params = new URLSearchParams({ txHash: exec.sourceTxHash, fromChain: String(meta.fromChainId), toChain: String(meta.toChainId), bridge: meta.tool });
      const s = await fetchJson<StatusResponse>(exec.fetch, `${API}/status?${params.toString()}`, undefined, 10_000, 0);
      if (s.status === "DONE") return { kind: "FILLED", detail: s.substatus ?? "filled", destinationTxHash: s.receiving?.txHash, amountOut: s.receiving?.amount ? BigInt(s.receiving.amount) : undefined };
      if (s.status === "FAILED" || s.status === "INVALID") return { kind: "FAILED", detail: `LI.FI reported ${s.status}${s.substatus ? ` (${s.substatus})` : ""}` };
    } catch {
      // fall through to balance polling
    }
    const poll = (exec.poll ?? {}) as { destBalanceBefore?: string; expectedOut?: string };
    const dst = exec.clients.get(meta.toChainId);
    const balance = meta.nativeOut
      ? await dst.getBalance({ address: exec.wallet })
      : await dst.readContract({ address: meta.toToken, abi: erc20Abi, functionName: "balanceOf", args: [exec.wallet] });
    const expected = poll.expectedOut ? BigInt(poll.expectedOut) : 0n;
    if (poll.destBalanceBefore !== undefined && expected > 0n && balance - BigInt(poll.destBalanceBefore) >= (expected * 95n) / 100n) {
      return { kind: "FILLED", detail: "Destination balance increased", amountOut: balance - BigInt(poll.destBalanceBefore) };
    }
    return { kind: "PENDING", detail: "Waiting for a LI.FI testnet solver (best effort)" };
  },
};
