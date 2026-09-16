import { encodeFunctionData, parseAbi, type Hex } from "viem";
import {
  nodeFromAsset,
  scaleDecimals,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { CCTP_DOMAINS, CCTP_V2_TESTNET, SOURCES, cctpDomainFor, findAsset, findChain, usdcAsset } from "@testnet-router/registry";
import { TtlCache, approvalStepIfNeeded, assetById, edgeId, fetchJson, stepId, toBytes32Address } from "../shared";

const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
]);
const messageTransmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);

const QUOTE_TTL_MS = 5 * 60_000;
const FAST_SECONDS = 60;
const STANDARD_SECONDS = 15 * 60;

/** Fee tables and the fast-burn allowance are not user specific: cache briefly (Iris allows 40 req/s). */
const feeCache = new TtlCache<FeeEntry[]>(60_000);
const allowanceCache = new TtlCache<{ allowance: number }>(30_000);

interface CctpMeta {
  sourceDomain: number;
  destinationDomain: number;
  burnToken: Address;
  /** Decimals of the ERC-20 burn interface (always 6 for USDC). */
  burnDecimals: number;
  fastTransfer: boolean;
}

interface FeeEntry {
  finalityThreshold: number;
  minimumFee: number;
}

interface IrisMessage {
  message: Hex | "0x";
  eventNonce: Hex;
  attestation: Hex | "PENDING";
  status: "complete" | "pending_confirmations";
  delayReason?: string;
  cctpVersion?: number;
  decodedMessage?: {
    decodedMessageBody?: {
      amount?: string;
      feeExecuted?: string;
      mintRecipient?: string;
    };
  };
}

/** The ERC-20 interface used for burning: Circle USDC, or Arc's native mirror. */
function burnTokenFor(asset: Asset): { address: Address; decimals: number } | undefined {
  if (asset.address) return { address: asset.address, decimals: asset.decimals };
  const chain = findChain(asset.chainId);
  const mirror = chain?.nativeAsset.erc20Mirror;
  if (mirror) return { address: mirror.address, decimals: mirror.decimals };
  return undefined;
}

/**
 * Circle CCTP (current version). Native USDC burn on source, attestation via
 * Iris, mint on destination. The destination mint is submitted by the user
 * (no Forwarding Service yet), so destination gas is required.
 */
export const circleCctpProvider: RouteProvider = {
  key: "circle-cctp",
  name: "Circle CCTP",
  source: SOURCES.circleCctpContracts,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    const domains = CCTP_DOMAINS.filter((d) => ctx.chains.some((c) => c.id === d.chainId));
    for (const src of domains) {
      const fromAsset = usdcAsset(src.chainId);
      const burn = fromAsset ? burnTokenFor(fromAsset) : undefined;
      if (!fromAsset || !burn) continue;
      if (ctx.sourceChainIds && !ctx.sourceChainIds.includes(src.chainId)) continue;
      for (const dst of domains) {
        if (dst.chainId === src.chainId) continue;
        const toAsset = usdcAsset(dst.chainId);
        if (!toAsset) continue;
        if (ctx.destination && ctx.destination.chainId !== dst.chainId && ctx.destination.chainId !== src.chainId) {
          // keep graph complete: intermediate hops may still be useful
        }
        const from = nodeFromAsset(fromAsset);
        const to = nodeFromAsset(toAsset);
        const meta: CctpMeta = {
          sourceDomain: src.domain,
          destinationDomain: dst.domain,
          burnToken: burn.address,
          burnDecimals: burn.decimals,
          fastTransfer: src.fastTransfer,
        };
        edges.push({
          id: edgeId("circle-cctp", "CCTP", from, to),
          provider: "circle-cctp",
          type: "CCTP",
          from,
          to,
          crossChain: true,
          requiresApproval: true,
          requiresSourceGas: true,
          requiresDestinationGas: true,
          outputCanonicality: toAsset.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
          reliabilityClass: "ISSUER",
          baselineGasUnits: 180_000n,
          baselineSeconds: src.fastTransfer ? FAST_SECONDS : STANDARD_SECONDS,
          source: SOURCES.circleCctpDomains,
          trustMetadata: { issuerApproved: true, sourceRegistry: "Circle CCTP domain registry" },
          meta: meta as unknown as Record<string, unknown>,
        });
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as CctpMeta;
    const fromAsset = assetById(req.assets, req.edge.from.assetId);
    const toAsset = assetById(req.assets, req.edge.to.assetId);
    const usdcIn = scaleDecimals(req.amountIn, fromAsset.decimals, meta.burnDecimals);
    if (usdcIn <= 0n) return null;

    const feeUrl = `${CCTP_V2_TESTNET.irisApiBase}/v2/burn/USDC/fees/${meta.sourceDomain}/${meta.destinationDomain}`;
    const fees = await feeCache.get(feeUrl, () => fetchJson<FeeEntry[]>(req.fetch, feeUrl));
    const fast = fees.find((f) => f.finalityThreshold === CCTP_V2_TESTNET.finality.fast);
    const standard = fees.find((f) => f.finalityThreshold === CCTP_V2_TESTNET.finality.standard);

    let useFast = false;
    if (meta.fastTransfer && fast) {
      try {
        const allowanceUrl = `${CCTP_V2_TESTNET.irisApiBase}/v2/fastBurn/USDC/allowance`;
        const allowance = await allowanceCache.get(allowanceUrl, () => fetchJson<{ allowance: number }>(req.fetch, allowanceUrl));
        useFast = Number(usdcIn) / 10 ** meta.burnDecimals <= allowance.allowance;
      } catch {
        useFast = false;
      }
    }
    const entry = useFast ? fast : standard;
    if (!entry) return null;
    const feeBps = BigInt(Math.ceil(entry.minimumFee));
    let maxFee = (usdcIn * feeBps) / 10_000n;
    if (feeBps > 0n) maxFee += 1n; // rounding guard
    if (maxFee >= usdcIn) return null;
    const usdcOut = usdcIn - maxFee;
    const amountOut = scaleDecimals(usdcOut, meta.burnDecimals, toAsset.decimals);
    const feeOut = scaleDecimals(maxFee, meta.burnDecimals, toAsset.decimals);

    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: useFast ? "Fast Transfer (finality 1000)" : "Standard Transfer (finality 2000)",
      quote: {
        provider: "circle-cctp",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: amountOut,
        feeOut,
        estimatedGasUnits: 180_000n,
        estimatedSeconds: useFast ? FAST_SECONDS : STANDARD_SECONDS,
        txCount: 2,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: {
          usdcIn: usdcIn.toString(),
          maxFee: maxFee.toString(),
          minFinalityThreshold: useFast ? CCTP_V2_TESTNET.finality.fast : CCTP_V2_TESTNET.finality.standard,
          feeBps: entry.minimumFee,
        },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as CctpMeta;
    const raw = edge.quote.raw as { maxFee: string; minFinalityThreshold: number };
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const client = ctx.clients.get(edge.from.chainId);
    const usdcIn = scaleDecimals(ctx.amountIn, fromAsset.decimals, meta.burnDecimals);
    const maxFee = BigInt(raw.maxFee);
    const steps: ExecutionStep[] = [];

    const approve = await approvalStepIfNeeded({
      client,
      chainId: edge.from.chainId,
      token: meta.burnToken,
      owner: ctx.wallet,
      spender: CCTP_V2_TESTNET.tokenMessengerV2,
      amount: usdcIn,
      provider: "circle-cctp",
      edgeId: edge.id,
      symbol: "USDC",
    });
    if (approve) steps.push(approve);

    steps.push({
      id: stepId(edge.id, "burn"),
      type: "BRIDGE",
      chainId: edge.from.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: `CCTP burn (domain ${meta.sourceDomain} → ${meta.destinationDomain})`,
      status: "PENDING",
      simulate: true,
      expiresAt: edge.quote.expiresAt,
      tx: {
        chainId: edge.from.chainId,
        to: CCTP_V2_TESTNET.tokenMessengerV2,
        value: 0n,
        data: encodeFunctionData({
          abi: tokenMessengerAbi,
          functionName: "depositForBurn",
          args: [
            usdcIn,
            meta.destinationDomain,
            toBytes32Address(ctx.recipient),
            meta.burnToken,
            toBytes32Address("0x0000000000000000000000000000000000000000"),
            maxFee,
            raw.minFinalityThreshold,
          ],
        }),
      },
    });
    steps.push({
      id: stepId(edge.id, "attest"),
      type: "WAIT_ATTESTATION",
      chainId: edge.to.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: "Circle attestation",
      status: "PENDING",
      pollIntervalMs: 8_000,
      poll: { sourceDomain: meta.sourceDomain, destinationChainId: edge.to.chainId },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as CctpMeta;
    const toAsset: Asset | undefined = findAsset(exec.edge.to.assetId);
    const url = `${CCTP_V2_TESTNET.irisApiBase}/v2/messages/${meta.sourceDomain}?transactionHash=${exec.sourceTxHash}`;
    let payload: { messages?: IrisMessage[] };
    try {
      payload = await fetchJson<{ messages?: IrisMessage[] }>(exec.fetch, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("HTTP 404")) return { kind: "PENDING", detail: "Waiting for Circle to index the burn" };
      throw err;
    }
    const message = payload.messages?.[0];
    if (!message) return { kind: "PENDING", detail: "Burn not indexed yet" };
    if (message.status !== "complete" || message.attestation === "PENDING" || message.message === "0x") {
      const reason = message.delayReason ? ` (${message.delayReason})` : "";
      return { kind: "PENDING", detail: `Attestation pending${reason}` };
    }

    const dstClient = exec.clients.get(exec.edge.to.chainId);
    const used = await dstClient.readContract({
      address: CCTP_V2_TESTNET.messageTransmitterV2,
      abi: messageTransmitterAbi,
      functionName: "usedNonces",
      args: [message.eventNonce],
    });
    const body = message.decodedMessage?.decodedMessageBody;
    const amount = body?.amount ? BigInt(body.amount) - BigInt(body.feeExecuted ?? "0") : undefined;
    const dstDecimals = toAsset?.decimals ?? (findChain(exec.edge.to.chainId)?.nativeAsset.erc20Mirror ? 18 : 6);
    const amountOut = amount !== undefined ? scaleDecimals(amount, meta.burnDecimals, dstDecimals) : undefined;

    if (used > 0n) {
      return { kind: "MINTED", detail: "Already minted on destination", amountOut };
    }
    return {
      kind: "ATTESTED",
      detail: "Attestation ready: submit destination mint",
      needsClaim: true,
      amountOut,
      claim: {
        chainId: exec.edge.to.chainId,
        to: CCTP_V2_TESTNET.messageTransmitterV2,
        value: 0n,
        data: encodeFunctionData({
          abi: messageTransmitterAbi,
          functionName: "receiveMessage",
          args: [message.message as Hex, message.attestation as Hex],
        }),
      },
    };
  },
};

export function cctpPairSupported(sourceChainId: number, destinationChainId: number): boolean {
  return Boolean(cctpDomainFor(sourceChainId) && cctpDomainFor(destinationChainId) && sourceChainId !== destinationChainId);
}
