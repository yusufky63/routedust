import { encodeFunctionData, parseAbi, type Hex, type PublicClient } from "viem";
import {
  QuoteLimitError,
  applyBps,
  nodeFromAsset,
  type Address,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { LAYERZERO_SCAN_TESTNET_API, SOURCES, STARGATE_NATIVE_POOLS, findChain, nativeAsset } from "@testnet-router/registry";
import { TtlCache, ZERO_ADDRESS, assetById, edgeId, fetchJson, runtimeSource, stepId, toBytes32Address } from "../shared";

const stargateAbi = parseAbi([
  "struct SendParam { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }",
  "struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }",
  "struct OFTLimit { uint256 minAmountLD; uint256 maxAmountLD; }",
  "struct OFTReceipt { uint256 amountSentLD; uint256 amountReceivedLD; }",
  "struct OFTFeeDetail { int256 feeAmountLD; string description; }",
  "struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }",
  "struct Ticket { uint72 ticketId; bytes passengerBytes; }",
  "function token() view returns (address)",
  "function paths(uint32) view returns (uint64 credit)",
  "function quoteOFT(SendParam) view returns (OFTLimit, OFTFeeDetail[], OFTReceipt)",
  "function quoteSend(SendParam, bool) view returns (MessagingFee)",
  "function sendToken(SendParam, MessagingFee, address) payable returns (MessagingReceipt, OFTReceipt, Ticket)",
]);

const QUOTE_TTL_MS = 60_000;
/** Taxi mode: empty oftCmd, delivered as its own LayerZero message. */
const TAXI: Hex = "0x";
const creditCache = new TtlCache<bigint>(60_000);

interface StargateMeta {
  fromChainId: number;
  toChainId: number;
  pool: Address;
  dstEid: number;
}

interface ScanMessage {
  status?: { name?: string; message?: string };
  destination?: { status?: string; tx?: { txHash?: Hex } };
}

function sendParam(meta: StargateMeta, recipient: Address, amountLD: bigint, minAmountLD: bigint) {
  return { dstEid: meta.dstEid, to: toBytes32Address(recipient), amountLD, minAmountLD, extraOptions: "0x" as Hex, composeMsg: "0x" as Hex, oftCmd: TAXI };
}

async function pathCredit(client: PublicClient, pool: Address, dstEid: number): Promise<bigint> {
  return creditCache.get(`${pool}:${dstEid}`, async () => client.readContract({ address: pool, abi: stargateAbi, functionName: "paths", args: [dstEid] }));
}

/**
 * Stargate V2 native ETH pools between Sepolia, Arbitrum Sepolia and OP
 * Sepolia. Liquidity per path is the pool's credit (shared 6 decimals): the
 * adapter reads it live and reports the cap as a provider limit so the
 * planner can route the part that fits. Delivery is confirmed through
 * LayerZero Scan, with destination-balance polling as a fallback.
 */
export const stargateProvider: RouteProvider = {
  key: "stargate",
  name: "Stargate V2 (ETH)",
  source: SOURCES.stargateTestnet,

  async discover(ctx) {
    const known = new Set(ctx.chains.map((c) => c.id));
    const pools = STARGATE_NATIVE_POOLS.filter((p) => known.has(p.chainId));
    const edges: CapabilityEdge[] = [];
    for (const src of pools) {
      if (ctx.sourceChainIds && !ctx.sourceChainIds.includes(src.chainId)) continue;
      const client = ctx.clients.get(src.chainId);
      let isNative = false;
      try {
        isNative = (await client.readContract({ address: src.pool, abi: stargateAbi, functionName: "token" })) === ZERO_ADDRESS;
      } catch {
        isNative = false;
      }
      if (!isNative) continue;
      const fromAsset = nativeAsset(src.chainId);
      for (const dst of pools) {
        if (dst.chainId === src.chainId) continue;
        let credit = 0n;
        try {
          credit = await pathCredit(client, src.pool, dst.eid);
        } catch {
          credit = 0n;
        }
        if (credit === 0n) continue;
        const toAsset = nativeAsset(dst.chainId);
        const from = nodeFromAsset(fromAsset);
        const to = nodeFromAsset(toAsset);
        const meta: StargateMeta = { fromChainId: src.chainId, toChainId: dst.chainId, pool: src.pool, dstEid: dst.eid };
        edges.push({
          id: edgeId("stargate", "STARGATE", from, to),
          provider: "stargate",
          type: "STARGATE",
          from,
          to,
          crossChain: true,
          requiresApproval: false,
          requiresSourceGas: true,
          requiresDestinationGas: false,
          outputCanonicality: "NATIVE",
          reliabilityClass: "BEST_EFFORT_TESTNET",
          baselineGasUnits: 400_000n,
          baselineSeconds: 120,
          source: runtimeSource(src.source.url, `StargatePoolNative ${src.pool}; credit to eid ${dst.eid}: ${credit} (6 dec)`),
          trustMetadata: { sourceRegistry: "stargate-v2 deployments", registryProvenance: "official-registry" },
          meta: meta as unknown as Record<string, unknown>,
        });
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as StargateMeta;
    const client = req.clients.get(meta.fromChainId);
    const param = sendParam(meta, req.recipient, req.amountIn, 0n);
    let limit: { minAmountLD: bigint; maxAmountLD: bigint };
    let receipt: { amountReceivedLD: bigint };
    try {
      const [oftLimit, , oftReceipt] = await client.readContract({ address: meta.pool, abi: stargateAbi, functionName: "quoteOFT", args: [param] });
      limit = oftLimit;
      receipt = oftReceipt;
    } catch {
      return null;
    }
    if (req.amountIn > limit.maxAmountLD) throw new QuoteLimitError(`amount above the Stargate path credit (max ${limit.maxAmountLD} wei)`, limit.maxAmountLD);
    if (req.amountIn < limit.minAmountLD || receipt.amountReceivedLD === 0n) return null;
    const minOut = applyBps(receipt.amountReceivedLD, req.slippageBps);
    const fee = await client.readContract({ address: meta.pool, abi: stargateAbi, functionName: "quoteSend", args: [sendParam(meta, req.recipient, req.amountIn, minOut), false] });
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `taxi · LayerZero fee ${fee.nativeFee} wei · path credit ${limit.maxAmountLD} wei`,
      quote: {
        provider: "stargate",
        amountIn: req.amountIn,
        amountOut: receipt.amountReceivedLD,
        minAmountOut: minOut,
        feeOut: req.amountIn - receipt.amountReceivedLD,
        estimatedGasUnits: 400_000n,
        nativeFeeWei: fee.nativeFee,
        estimatedSeconds: 120,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: { nativeFee: fee.nativeFee.toString(), minOut: minOut.toString() },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as StargateMeta;
    const client = ctx.clients.get(meta.fromChainId);
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const amountIn = ctx.amountIn;
    const minOut = amountIn === edge.quote.amountIn ? edge.quote.minAmountOut : applyBps((edge.quote.amountOut * amountIn) / edge.quote.amountIn, 100);
    const param = sendParam(meta, ctx.recipient, amountIn, minOut);
    // Re-quote the messaging fee at build time; it moves with destination gas prices.
    const fee = await client.readContract({ address: meta.pool, abi: stargateAbi, functionName: "quoteSend", args: [param, false] });
    const dst = ctx.clients.get(meta.toChainId);
    const balanceBefore = await dst.getBalance({ address: ctx.recipient });
    const steps: ExecutionStep[] = [
      {
        id: stepId(edge.id, "send"),
        type: "BRIDGE",
        chainId: meta.fromChainId,
        provider: "stargate",
        edgeId: edge.id,
        label: `Stargate sendToken → ${findChain(meta.toChainId)?.shortName ?? meta.toChainId}`,
        status: "PENDING",
        simulate: true,
        expiresAt: edge.quote.expiresAt,
        summary: `StargatePoolNative.sendToken(eid ${meta.dstEid}, to ${ctx.recipient}, ${amountIn} wei, min ${minOut} wei) with msg.value ${amountIn + fee.nativeFee} wei (amount + LayerZero fee)`,
        tx: {
          chainId: meta.fromChainId,
          to: meta.pool,
          value: amountIn + fee.nativeFee,
          data: encodeFunctionData({ abi: stargateAbi, functionName: "sendToken", args: [param, { nativeFee: fee.nativeFee, lzTokenFee: 0n }, ctx.wallet] }),
        },
      },
      {
        id: stepId(edge.id, "deliver"),
        type: "WAIT_ATTESTATION",
        chainId: meta.toChainId,
        provider: "stargate",
        edgeId: edge.id,
        label: "LayerZero delivery",
        status: "PENDING",
        pollIntervalMs: 10_000,
        poll: { destBalanceBefore: balanceBefore.toString(), expectedOut: minOut.toString() },
      },
    ];
    void fromAsset;
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as StargateMeta;
    try {
      const res = await fetchJson<{ data?: ScanMessage[] }>(exec.fetch, `${LAYERZERO_SCAN_TESTNET_API}/messages/tx/${exec.sourceTxHash}`, undefined, 10_000, 0);
      const msg = res.data?.[0];
      const name = msg?.status?.name;
      if (name === "DELIVERED") return { kind: "FILLED", detail: "Delivered by LayerZero", destinationTxHash: msg?.destination?.tx?.txHash };
      if (name === "FAILED" || name === "BLOCKED" || name === "PAYLOAD_STORED") return { kind: "FAILED", detail: `LayerZero reports ${name}${msg?.status?.message ? `: ${msg.status.message}` : ""}` };
      if (name) return { kind: "PENDING", detail: `LayerZero: ${name}` };
    } catch {
      // Scan not indexed yet: fall through to balance polling
    }
    const poll = (exec.poll ?? {}) as { destBalanceBefore?: string; expectedOut?: string };
    const balance = await exec.clients.get(meta.toChainId).getBalance({ address: exec.wallet });
    const expected = poll.expectedOut ? BigInt(poll.expectedOut) : 0n;
    if (poll.destBalanceBefore !== undefined && expected > 0n && balance - BigInt(poll.destBalanceBefore) >= (expected * 95n) / 100n) {
      return { kind: "FILLED", detail: "Destination balance increased", amountOut: balance - BigInt(poll.destBalanceBefore) };
    }
    return { kind: "PENDING", detail: "Waiting for LayerZero delivery" };
  },
};
