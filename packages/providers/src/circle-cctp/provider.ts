import { decodeFunctionData, encodeFunctionData, parseAbi, parseAbiItem, type Hex, type PublicClient } from "viem";
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
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);

/** Version-0 forwarding hook: "cctp-forward" padded to 24 bytes + uint32 version 0 + uint32 length 0. */
const FORWARD_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;
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
  /** Circle Forwarding Service: Circle submits the destination mint and takes its fee from the burned amount. */
  forward: boolean;
}

interface FeeEntry {
  finalityThreshold: number;
  minimumFee: number;
  /** Present with ?forward=true; USDC minor units. The docs use both `medium` and `med`. */
  forwardFee?: { low?: number; medium?: number; med?: number; high?: number };
}

function forwardFeeOf(entry: FeeEntry | undefined): bigint | undefined {
  const f = entry?.forwardFee;
  const v = f?.medium ?? f?.med ?? f?.high ?? f?.low;
  return v === undefined ? undefined : BigInt(Math.ceil(v));
}

interface IrisMessage {
  message: Hex | "0x";
  eventNonce: Hex;
  attestation: Hex | "PENDING";
  status: "complete" | "pending_confirmations";
  delayReason?: string;
  cctpVersion?: number;
  /** Forwarding Service fields (present when the burn carried the forward hook). */
  forwardTxHash?: Hex;
  forwardState?: string;
  decodedMessage?: {
    decodedMessageBody?: {
      amount?: string;
      feeExecuted?: string;
      mintRecipient?: string;
    };
  };
}

/** Arbitrum's block.number is the L1 block, so a Fast Transfer expiry there is measured on Ethereum Sepolia. */
const EXPIRY_BLOCK_CHAIN: Record<number, number> = { 421614: 11155111 };
const REATTEST_RETRY_MS = 5 * 60_000;

/**
 * expirationBlock of a CCTP V2 burn message: 148-byte message header, then the
 * burn body (version 4, burnToken 32, mintRecipient 32, amount 32,
 * messageSender 32, maxFee 32, feeExecuted 32, expirationBlock 32). 0 = never
 * expires (standard finality).
 */
export function cctpExpirationBlock(message: Hex): bigint {
  const start = 2 + (148 + 4 + 32 * 6) * 2;
  const word = message.slice(start, start + 64);
  return word.length === 64 ? BigInt(`0x${word}`) : 0n;
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
 * Iris, mint on destination. Every pair gets two edges: a manual mint (the
 * wallet submits receiveMessage, destination gas required) and, where Circle
 * supports it, a Forwarding Service variant where Circle submits the mint and
 * deducts a flat USDC fee from the burned amount.
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
        const variants: boolean[] = dst.forwarding ? [false, true] : [false];
        for (const forward of variants) {
          const meta: CctpMeta = {
            sourceDomain: src.domain,
            destinationDomain: dst.domain,
            burnToken: burn.address,
            burnDecimals: burn.decimals,
            fastTransfer: src.fastTransfer,
            forward,
          };
          edges.push({
            id: forward ? edgeId("circle-cctp", "CCTP", from, to, "fwd") : edgeId("circle-cctp", "CCTP", from, to),
            provider: "circle-cctp",
            type: "CCTP",
            from,
            to,
            crossChain: true,
            requiresApproval: true,
            requiresSourceGas: true,
            // Forwarding: Circle submits the destination mint, so the wallet needs no destination gas.
            requiresDestinationGas: !forward,
            outputCanonicality: toAsset.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
            reliabilityClass: "ISSUER",
            baselineGasUnits: forward ? 200_000n : 180_000n,
            baselineSeconds: src.fastTransfer ? FAST_SECONDS : STANDARD_SECONDS,
            source: SOURCES.circleCctpDomains,
            trustMetadata: {
              issuerApproved: true,
              sourceRegistry: forward ? "Circle CCTP domain registry (Forwarding Service)" : "Circle CCTP domain registry",
            },
            meta: meta as unknown as Record<string, unknown>,
          });
        }
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

    const feeUrl = `${CCTP_V2_TESTNET.irisApiBase}/v2/burn/USDC/fees/${meta.sourceDomain}/${meta.destinationDomain}${meta.forward ? "?forward=true" : ""}`;
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
    // Forwarding Service: Circle's relay fee is a flat USDC amount taken from the burned amount.
    let forwardFee = 0n;
    if (meta.forward) {
      const f = forwardFeeOf(entry);
      if (f === undefined) return null;
      forwardFee = f;
      maxFee += forwardFee;
    }
    if (maxFee >= usdcIn) return null;
    const usdcOut = usdcIn - maxFee;
    const amountOut = scaleDecimals(usdcOut, meta.burnDecimals, toAsset.decimals);
    const feeOut = scaleDecimals(maxFee, meta.burnDecimals, toAsset.decimals);
    const speed = useFast ? "Fast Transfer (finality 1000)" : "Standard Transfer (finality 2000)";

    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: meta.forward ? `${speed} · Circle mints on destination (forward fee ${(Number(forwardFee) / 10 ** meta.burnDecimals).toFixed(2)} USDC)` : speed,
      quote: {
        provider: "circle-cctp",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: amountOut,
        feeOut,
        estimatedGasUnits: meta.forward ? 200_000n : 180_000n,
        estimatedSeconds: useFast ? FAST_SECONDS : STANDARD_SECONDS,
        txCount: meta.forward ? 1 : 2,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: {
          usdcIn: usdcIn.toString(),
          maxFee: maxFee.toString(),
          forwardFee: forwardFee.toString(),
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

    const burnArgs = [
      usdcIn,
      meta.destinationDomain,
      toBytes32Address(ctx.recipient),
      meta.burnToken,
      toBytes32Address("0x0000000000000000000000000000000000000000"),
      maxFee,
      raw.minFinalityThreshold,
    ] as const;
    steps.push({
      id: stepId(edge.id, "burn"),
      type: "BRIDGE",
      chainId: edge.from.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: `CCTP burn (domain ${meta.sourceDomain} → ${meta.destinationDomain})${meta.forward ? " with forwarding hook" : ""}`,
      status: "PENDING",
      simulate: true,
      summary: `TokenMessengerV2.${meta.forward ? "depositForBurnWithHook" : "depositForBurn"}(${usdcIn} USDC units → domain ${meta.destinationDomain}, mintRecipient ${ctx.recipient}, maxFee ${maxFee}${meta.forward ? ", hook cctp-forward" : ""})`,
      expiresAt: edge.quote.expiresAt,
      tx: {
        chainId: edge.from.chainId,
        to: CCTP_V2_TESTNET.tokenMessengerV2,
        value: 0n,
        data: meta.forward
          ? encodeFunctionData({ abi: tokenMessengerAbi, functionName: "depositForBurnWithHook", args: [...burnArgs, FORWARD_HOOK_DATA] })
          : encodeFunctionData({ abi: tokenMessengerAbi, functionName: "depositForBurn", args: [...burnArgs] }),
      },
    });
    steps.push({
      id: stepId(edge.id, "attest"),
      type: "WAIT_ATTESTATION",
      chainId: edge.to.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: meta.forward ? "Circle attestation and forwarded mint" : "Circle attestation",
      status: "PENDING",
      pollIntervalMs: 8_000,
      poll: { sourceDomain: meta.sourceDomain, destinationChainId: edge.to.chainId, forward: meta.forward },
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
      return {
        kind: "MINTED",
        detail: meta.forward ? "Minted on destination by Circle's Forwarding Service" : "Already minted on destination",
        amountOut,
        destinationTxHash: message.forwardTxHash,
      };
    }
    // A Fast Transfer attestation is only valid until expirationBlock (about a day): receiveMessage reverts after
    // it. Nothing is lost: Circle re-signs the same burn on request, without a deadline.
    const expiration = cctpExpirationBlock(message.message as Hex);
    if (expiration > 0n) {
      const current = await exec.clients.get(EXPIRY_BLOCK_CHAIN[exec.edge.to.chainId] ?? exec.edge.to.chainId).getBlockNumber();
      if (current >= expiration) {
        const last = Number((exec.poll as { reattestAt?: number } | undefined)?.reattestAt ?? 0);
        if (Date.now() - last < REATTEST_RETRY_MS) return { kind: "PENDING", detail: "Attestation expired; waiting for Circle's fresh attestation" };
        try {
          await fetchJson<unknown>(exec.fetch, `${CCTP_V2_TESTNET.irisApiBase}/v2/reattest/${message.eventNonce}`, { method: "POST" }, 15_000, 0);
        } catch (err) {
          return { kind: "PENDING", detail: `Attestation expired; re-attest request failed, retrying in a few minutes (${err instanceof Error ? err.message.slice(0, 80) : "error"})`, persist: { reattestAt: Date.now() } };
        }
        return { kind: "PENDING", detail: "Attestation expired (Fast Transfer attestations last about a day); asked Circle to re-attest the burn", persist: { reattestAt: Date.now() } };
      }
    }
    if (meta.forward) {
      const state = (message.forwardState ?? "").toLowerCase();
      if (!/fail|error|expired/.test(state)) {
        return { kind: "PENDING", detail: `Attested; waiting for Circle to submit the mint${message.forwardState ? ` (${message.forwardState})` : ""}` };
      }
      // Forwarding gave up: fall back to a manual mint below.
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

  /** A burn whose wallet request errored after broadcast: find it in the DepositForBurn logs instead of burning again. */
  async recover({ step, edge, wallet, clients }) {
    if (step.type !== "BRIDGE") return undefined;
    const meta = edge.meta as unknown as CctpMeta;
    const decoded = decodeFunctionData({ abi: tokenMessengerAbi, data: step.tx.data });
    const amount = decoded.args[0] as bigint;
    const client = clients.get(step.chainId);
    const head = await client.getBlockNumber();
    const from = step.startBlock ? BigInt(step.startBlock) - 5n : head - 3000n;
    const burns = await findDepositForBurns(client, wallet, from > 0n ? from : 0n, head);
    const match = burns.find((b) => b.amount === amount && b.destinationDomain === meta.destinationDomain && b.burnToken.toLowerCase() === meta.burnToken.toLowerCase());
    return match?.txHash;
  },
};

const depositForBurnEvent = parseAbiItem(
  "event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)",
);

export interface DepositForBurnLog {
  txHash: Hex;
  blockNumber: bigint;
  burnToken: Address;
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  hookData: Hex;
  minFinalityThreshold: number;
}

/**
 * The wallet's CCTP burns on one chain, newest first, read from TokenMessengerV2
 * logs in bounded chunks (public RPCs cap eth_getLogs ranges). Used to resume
 * a burn whose wallet request failed after broadcast and to list unminted burns.
 */
export async function findDepositForBurns(client: PublicClient, wallet: Address, fromBlock: bigint, toBlock: bigint, onChunk?: (scanned: bigint, total: bigint) => void): Promise<DepositForBurnLog[]> {
  const out: DepositForBurnLog[] = [];
  let chunk = 2000n;
  let hi = toBlock;
  const total = toBlock - fromBlock + 1n;
  while (hi >= fromBlock) {
    const lo = hi - chunk + 1n > fromBlock ? hi - chunk + 1n : fromBlock;
    try {
      const logs = await client.getLogs({ address: CCTP_V2_TESTNET.tokenMessengerV2, event: depositForBurnEvent, args: { depositor: wallet }, fromBlock: lo, toBlock: hi });
      for (const log of logs) {
        const a = log.args;
        if (a.amount === undefined || a.destinationDomain === undefined || !a.burnToken) continue;
        out.push({
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          burnToken: a.burnToken,
          amount: a.amount,
          destinationDomain: a.destinationDomain,
          mintRecipient: (a.mintRecipient ?? "0x") as Hex,
          hookData: (a.hookData ?? "0x") as Hex,
          minFinalityThreshold: a.minFinalityThreshold ?? 0,
        });
      }
      onChunk?.(toBlock - lo + 1n, total);
      hi = lo - 1n;
    } catch (err) {
      // Range too wide for this endpoint: halve and retry; give up below 100 blocks.
      if (chunk <= 100n) throw err;
      chunk /= 2n;
    }
  }
  return out.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
}

export const CCTP_FORWARD_HOOK_DATA = FORWARD_HOOK_DATA;

export function cctpPairSupported(sourceChainId: number, destinationChainId: number): boolean {
  return Boolean(cctpDomainFor(sourceChainId) && cctpDomainFor(destinationChainId) && sourceChainId !== destinationChainId);
}
