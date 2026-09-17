import { assembleCandidate, createExecution, scaleDecimals, type Address, type CapabilityEdge, type ClientResolver, type Hex, type Quote, type RouteEdge, type RouteExecution } from "@testnet-router/core";
import { CCTP_DOMAINS, CCTP_V2_TESTNET, chainIdForDomain } from "@testnet-router/registry";
import { CCTP_FORWARD_HOOK_DATA, circleCctpProvider, findDepositForBurns, type DepositForBurnLog } from "@testnet-router/providers";
import { findAnyAsset } from "./assets";

export type BurnStatus = "PENDING_ATTESTATION" | "READY_TO_MINT" | "MINTED" | "FORWARDING" | "UNKNOWN";

export interface BurnRecord extends DepositForBurnLog {
  chainId: number;
  sourceDomain: number;
  destinationChainId?: number;
  forward: boolean;
  status: BurnStatus;
  detail?: string;
  /** The matching discovery edge, when the pair is in the registry (needed to mint from here). */
  edge?: CapabilityEdge;
}

export interface BurnScanProgress {
  chainId: number;
  state: "scanning" | "checking" | "done" | "error";
  found: number;
  error?: string;
}

/** Default lookback per chain in blocks; deeper scans multiply it. */
export const DEFAULT_LOOKBACK = 20_000n;

function edgeFor(edges: CapabilityEdge[], chainId: number, destinationDomain: number, forward: boolean): CapabilityEdge | undefined {
  const destChainId = chainIdForDomain(destinationDomain);
  return edges.find((e) => e.provider === "circle-cctp" && e.from.chainId === chainId && e.to.chainId === destChainId && e.id.endsWith(":fwd") === forward);
}

/**
 * Lists the wallet's CCTP burns on every registry chain and asks Circle and
 * the destination chain what happened to each: attested but never minted
 * burns are the ones a user wants to see even after clearing history.
 */
export async function scanBurns(
  wallet: Address,
  clients: ClientResolver,
  edges: CapabilityEdge[],
  lookback: bigint,
  onProgress: (p: BurnScanProgress) => void,
): Promise<BurnRecord[]> {
  const out: BurnRecord[] = [];
  const fetchImpl = globalThis.fetch.bind(globalThis);
  await Promise.all(
    CCTP_DOMAINS.map(async (domain) => {
      const chainId = domain.chainId;
      onProgress({ chainId, state: "scanning", found: 0 });
      try {
        const client = clients.get(chainId);
        const head = await client.getBlockNumber();
        const from = head > lookback ? head - lookback : 0n;
        const logs = await findDepositForBurns(client, wallet, from, head);
        onProgress({ chainId, state: "checking", found: logs.length });
        for (const log of logs) {
          const forward = log.hookData.toLowerCase().startsWith(CCTP_FORWARD_HOOK_DATA.toLowerCase().slice(0, 26));
          const edge = edgeFor(edges, chainId, log.destinationDomain, forward);
          const record: BurnRecord = { ...log, chainId, sourceDomain: domain.domain, destinationChainId: chainIdForDomain(log.destinationDomain), forward, status: "UNKNOWN", edge };
          if (edge) {
            try {
              const routeEdge = { ...edge, quote: placeholderQuote(edge, log.amount), health: "QUOTED" } as RouteEdge;
              const status = await circleCctpProvider.status({ edge: routeEdge, sourceTxHash: log.txHash, wallet, clients, fetch: fetchImpl, poll: {} });
              record.detail = status.detail;
              record.status = status.kind === "MINTED" ? "MINTED" : status.kind === "ATTESTED" ? "READY_TO_MINT" : forward ? "FORWARDING" : "PENDING_ATTESTATION";
            } catch (err) {
              record.detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
            }
          }
          out.push(record);
        }
        onProgress({ chainId, state: "done", found: logs.length });
      } catch (err) {
        onProgress({ chainId, state: "error", found: 0, error: err instanceof Error ? err.message.split("\n")[0]?.slice(0, 120) : String(err) });
      }
    }),
  );
  return out.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : a.chainId - b.chainId));
}

function placeholderQuote(edge: CapabilityEdge, amount6: bigint): Quote {
  const fromAsset = findAnyAsset(edge.from.assetId);
  const toAsset = findAnyAsset(edge.to.assetId);
  const now = Date.now();
  return {
    provider: "circle-cctp",
    amountIn: scaleDecimals(amount6, 6, fromAsset?.decimals ?? 6),
    amountOut: scaleDecimals(amount6, 6, toAsset?.decimals ?? 6),
    minAmountOut: scaleDecimals(amount6, 6, toAsset?.decimals ?? 6),
    feeOut: 0n,
    estimatedGasUnits: 180_000n,
    estimatedSeconds: 15 * 60,
    txCount: edge.id.endsWith(":fwd") ? 1 : 2,
    quotedAt: now,
    expiresAt: now + 365 * 24 * 3_600_000,
  };
}

/**
 * An execution that starts at the attestation step: the burn is recorded as
 * confirmed with its hash, so the executor polls Circle and submits (or
 * watches) the mint without ever burning again.
 */
export function executionForBurn(burn: BurnRecord): RouteExecution | undefined {
  const edge = burn.edge;
  const fromAsset = edge ? findAnyAsset(edge.from.assetId) : undefined;
  if (!edge || !fromAsset) return undefined;
  const routeEdge = { ...edge, quote: placeholderQuote(edge, burn.amount), health: "QUOTED" } as RouteEdge;
  const candidate = assembleCandidate(fromAsset, routeEdge.quote.amountIn, edge.to, [routeEdge]);
  const ex = createExecution(candidate);
  ex.steps = [
    {
      id: `${edge.id}#burn`,
      type: "BRIDGE",
      chainId: burn.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: `CCTP burn (recovered from chain, block ${burn.blockNumber})`,
      status: "CONFIRMED",
      txHash: burn.txHash as Hex,
      simulate: false,
      completedAt: Date.now(),
      tx: { chainId: burn.chainId, to: CCTP_V2_TESTNET.tokenMessengerV2, value: 0n, data: "0x" },
    },
    {
      id: `${edge.id}#attest`,
      type: "WAIT_ATTESTATION",
      chainId: edge.to.chainId,
      provider: "circle-cctp",
      edgeId: edge.id,
      label: burn.forward ? "Circle attestation and forwarded mint" : "Circle attestation",
      status: "PENDING",
      pollIntervalMs: 8_000,
      poll: { sourceDomain: burn.sourceDomain, destinationChainId: edge.to.chainId, forward: burn.forward },
    },
  ];
  const first = ex.edges[0];
  if (first) first.sourceTxHash = burn.txHash as Hex;
  ex.log.push(`${new Date().toISOString()} Created from an on-chain burn ${burn.txHash}; the burn is never repeated`);
  return ex;
}
