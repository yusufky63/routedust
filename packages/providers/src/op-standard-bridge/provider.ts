import { encodeFunctionData, parseAbi } from "viem";
import { nodeFromAsset, type CapabilityEdge, type RouteEdge, type RouteProvider } from "@testnet-router/core";
import { OP_STANDARD_BRIDGES, SOURCES, nativeAsset } from "@testnet-router/registry";
import { edgeId, stepId } from "../shared";

const l1BridgeAbi = parseAbi(["function bridgeETHTo(address to, uint32 minGasLimit, bytes extraData) payable"]);

const QUOTE_TTL_MS = 10 * 60_000;
const DEPOSIT_SECONDS = 180;
const L2_MIN_GAS = 200_000;

interface OpMeta {
  l1ChainId: number;
  l2ChainId: number;
  l1StandardBridge: `0x${string}`;
}

/**
 * OP Stack canonical Standard Bridge, L1 -> L2 ETH deposits only. Withdrawals
 * (L2 -> L1) are multi-step and slow; they are intentionally not exposed.
 * This is never merged with Superchain interop (spec section 7).
 */
export const opStandardBridgeProvider: RouteProvider = {
  key: "op-standard-bridge",
  name: "OP Standard Bridge",
  source: SOURCES.optimismDocs,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    for (const b of OP_STANDARD_BRIDGES) {
      if (!ctx.chains.some((c) => c.id === b.l1ChainId) || !ctx.chains.some((c) => c.id === b.l2ChainId)) continue;
      const from = nodeFromAsset(nativeAsset(b.l1ChainId));
      const to = nodeFromAsset(nativeAsset(b.l2ChainId));
      const meta: OpMeta = { l1ChainId: b.l1ChainId, l2ChainId: b.l2ChainId, l1StandardBridge: b.l1StandardBridge };
      edges.push({
        id: edgeId("op-standard-bridge", "OP_STANDARD_BRIDGE", from, to),
        provider: "op-standard-bridge",
        type: "OP_STANDARD_BRIDGE",
        from,
        to,
        crossChain: true,
        requiresApproval: false,
        requiresSourceGas: true,
        requiresDestinationGas: false,
        outputCanonicality: "NATIVE",
        reliabilityClass: "CANONICAL",
        baselineGasUnits: 160_000n,
        baselineSeconds: DEPOSIT_SECONDS,
        source: b.source,
        trustMetadata: { sourceRegistry: "OP Stack Standard Bridge deployment" },
        meta: meta as unknown as Record<string, unknown>,
      });
    }
    return edges;
  },

  async quote(req) {
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: "canonical deposit, 1:1",
      quote: {
        provider: "op-standard-bridge",
        amountIn: req.amountIn,
        amountOut: req.amountIn,
        minAmountOut: req.amountIn,
        feeOut: 0n,
        estimatedGasUnits: 150_000n,
        estimatedSeconds: DEPOSIT_SECONDS,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as OpMeta;
    const l2 = ctx.clients.get(meta.l2ChainId);
    const balanceBefore = await l2.getBalance({ address: ctx.recipient });
    return [
      {
        id: stepId(edge.id, "deposit"),
        type: "BRIDGE",
        chainId: meta.l1ChainId,
        provider: "op-standard-bridge",
        edgeId: edge.id,
        label: `Standard Bridge deposit → chain ${meta.l2ChainId}`,
        status: "PENDING",
        simulate: true,
        tx: {
          chainId: meta.l1ChainId,
          to: meta.l1StandardBridge,
          value: ctx.amountIn,
          data: encodeFunctionData({ abi: l1BridgeAbi, functionName: "bridgeETHTo", args: [ctx.recipient, L2_MIN_GAS, "0x"] }),
        },
      },
      {
        id: stepId(edge.id, "relay"),
        type: "WAIT_ATTESTATION",
        chainId: meta.l2ChainId,
        provider: "op-standard-bridge",
        edgeId: edge.id,
        label: "L2 deposit relay",
        status: "PENDING",
        pollIntervalMs: 15_000,
        poll: { balanceBefore: balanceBefore.toString(), amount: ctx.amountIn.toString() },
      },
    ];
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as OpMeta;
    const l2 = exec.clients.get(meta.l2ChainId);
    const poll = (exec.poll ?? {}) as { balanceBefore?: string; amount?: string };
    const balance = await l2.getBalance({ address: exec.wallet });
    if (poll.balanceBefore !== undefined && balance > BigInt(poll.balanceBefore)) {
      return { kind: "COMPLETED", detail: "ETH arrived on L2", amountOut: balance - BigInt(poll.balanceBefore) };
    }
    return { kind: "PENDING", detail: "Waiting for the L2 deposit to be relayed" };
  },
};
