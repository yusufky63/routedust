import type { PublicClient } from "viem";
import type { Asset, AssetNode } from "./asset";
import type { ChainConfig } from "./chain";
import type { Address, Hex, SourceProvenance } from "./common";
import type { ExecutionStatus, ExecutionStep } from "./execution";
import type { CapabilityEdge, RouteEdge } from "./route";

export interface ClientResolver {
  get(chainId: number): PublicClient;
  chain(chainId: number): ChainConfig;
}

export interface DiscoveryContext {
  chains: ChainConfig[];
  assets: Asset[];
  clients: ClientResolver;
  fetch: typeof fetch;
  now: number;
  /** Only discover edges that can end at this destination (optional pruning hint). */
  destination?: AssetNode;
  /** Only discover edges starting on these chains (optional pruning hint). */
  sourceChainIds?: number[];
}

export interface QuoteRequest {
  edge: CapabilityEdge;
  amountIn: bigint;
  wallet: Address;
  recipient: Address;
  slippageBps: number;
  clients: ClientResolver;
  fetch: typeof fetch;
  assets: Asset[];
  now: number;
}

export interface BuildContext {
  wallet: Address;
  recipient: Address;
  /** Actual amount to route (may differ from the quote amount after a prior step). */
  amountIn: bigint;
  clients: ClientResolver;
  assets: Asset[];
  fetch: typeof fetch;
  now: number;
}

export interface ProviderExecution {
  edge: RouteEdge;
  sourceTxHash: Hex;
  wallet: Address;
  clients: ClientResolver;
  fetch: typeof fetch;
  /** The WAIT step's polling payload captured at build time (balance snapshots etc.). */
  poll?: Record<string, unknown>;
}

export interface ProviderCapabilitySummary {
  key: string;
  name: string;
  edges: number;
  chains: number[];
  ok: boolean;
  error?: string;
  discoveredAt: number;
  source: SourceProvenance;
}

/**
 * Every provider adapter returns the same normalized shape (spec section 15).
 */
export interface RouteProvider {
  key: string;
  name: string;
  source: SourceProvenance;
  discover(context: DiscoveryContext): Promise<CapabilityEdge[]>;
  quote(request: QuoteRequest): Promise<RouteEdge | null>;
  build(edge: RouteEdge, context: BuildContext): Promise<ExecutionStep[]>;
  status(execution: ProviderExecution): Promise<ExecutionStatus>;
}
