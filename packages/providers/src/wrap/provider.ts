import { encodeFunctionData, parseAbi } from "viem";
import {
  nodeFromAsset,
  type CapabilityEdge,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { SOURCES, nativeAsset, wrappedNative } from "@testnet-router/registry";
import { edgeId, stepId } from "../shared";

const wethAbi = parseAbi(["function deposit() payable", "function withdraw(uint256 wad)"]);

const QUOTE_TTL_MS = 10 * 60_000;

/**
 * Native <-> wrapped-native edges. Only chains whose wrapped contract was
 * verified on-chain get an edge (spec section 6.2).
 */
export const wrapProvider: RouteProvider = {
  key: "wrap",
  name: "Native wrap / unwrap",
  source: SOURCES.wrappedNativeProbe,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    for (const chain of ctx.chains) {
      const wrapped = wrappedNative(chain.id);
      if (!wrapped || !chain.nativeAsset.wrappedVerified) continue;
      const native = nativeAsset(chain.id);
      const from = nodeFromAsset(native);
      const to = nodeFromAsset(wrapped);
      const base = {
        provider: "wrap",
        crossChain: false,
        requiresApproval: false,
        requiresSourceGas: true,
        requiresDestinationGas: false,
        reliabilityClass: "CANONICAL" as const,
        baselineGasUnits: 60_000n,
        baselineSeconds: 15,
        source: SOURCES.wrappedNativeProbe,
        meta: { wrapped: wrapped.address },
      };
      edges.push({ ...base, id: edgeId("wrap", "WRAP", from, to), type: "WRAP", from, to, outputCanonicality: "WRAPPED" });
      edges.push({ ...base, id: edgeId("wrap", "UNWRAP", to, from), type: "UNWRAP", from: to, to: from, outputCanonicality: "NATIVE" });
    }
    return edges;
  },

  async quote(req) {
    const now = req.now;
    return {
      ...req.edge,
      health: "QUOTED",
      quote: {
        provider: "wrap",
        amountIn: req.amountIn,
        amountOut: req.amountIn,
        minAmountOut: req.amountIn,
        feeOut: 0n,
        estimatedGasUnits: 55_000n,
        estimatedSeconds: 15,
        txCount: 1,
        quotedAt: now,
        expiresAt: now + QUOTE_TTL_MS,
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const wrapped = edge.meta?.wrapped as `0x${string}`;
    if (edge.type === "WRAP") {
      return [
        {
          id: stepId(edge.id, "wrap"),
          type: "WRAP",
          chainId: edge.from.chainId,
          provider: "wrap",
          edgeId: edge.id,
          label: "Wrap native",
          status: "PENDING",
          simulate: true,
          summary: `${wrapped}.deposit() with msg.value ${ctx.amountIn} wei`,
          tx: { chainId: edge.from.chainId, to: wrapped, value: ctx.amountIn, data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }) },
        },
      ];
    }
    return [
      {
        id: stepId(edge.id, "unwrap"),
        type: "UNWRAP",
        chainId: edge.from.chainId,
        provider: "wrap",
        edgeId: edge.id,
        label: "Unwrap to native",
        status: "PENDING",
        simulate: true,
        summary: `${wrapped}.withdraw(${ctx.amountIn} wei)`,
        tx: {
          chainId: edge.from.chainId,
          to: wrapped,
          value: 0n,
          data: encodeFunctionData({ abi: wethAbi, functionName: "withdraw", args: [ctx.amountIn] }),
        },
      },
    ];
  },

  async status() {
    return { kind: "COMPLETED" };
  },
};
