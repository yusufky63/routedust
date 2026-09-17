import type { PublicClient } from "viem";
import type { Asset, AssetNode } from "./asset";
import type { ChainConfig } from "./chain";
import type { Address, Hex, SourceProvenance } from "./common";
import type { ExecutionStatus, ExecutionStep, TxStep } from "./execution";
import type { CapabilityEdge, RouteEdge } from "./route";

export interface ClientResolver {
  get(chainId: number): PublicClient;
  chain(chainId: number): ChainConfig;
  /** An independent client on a different RPC endpoint, when the chain lists one (cross-checks). */
  secondary?(chainId: number): PublicClient | undefined;
}

/** Runtime registry feeds. Hosts without CORS are proxied by the web app. */
export interface DiscoveryFeeds {
  /** Uniswap unified deployments JSON (defaults to the official feed). */
  uniswapDeployments?: string;
  /** LI.FI API base (defaults to https://li.quest/v1; the web app uses its /api/lifi proxy so the API key stays server-side). */
  lifiApiBase?: string;
}

export interface DiscoveryContext {
  chains: ChainConfig[];
  assets: Asset[];
  clients: ClientResolver;
  fetch: typeof fetch;
  now: number;
  feeds?: DiscoveryFeeds;
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
  /** Where the output lands (defaults to the wallet); destination balance polls must use this. */
  recipient?: Address;
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
/** A transaction step whose wallet nonce moved before a hash was recorded: find it on-chain. */
export interface RecoverInput {
  step: TxStep;
  edge: RouteEdge;
  wallet: Address;
  clients: ClientResolver;
  fetch: typeof fetch;
}

export interface RouteProvider {
  key: string;
  name: string;
  source: SourceProvenance;
  discover(context: DiscoveryContext): Promise<CapabilityEdge[]>;
  quote(request: QuoteRequest): Promise<RouteEdge | null>;
  build(edge: RouteEdge, context: BuildContext): Promise<ExecutionStep[]>;
  status(execution: ProviderExecution): Promise<ExecutionStatus>;
  /**
   * Returns the hash of an already-sent transaction equivalent to `step`
   * (e.g. a burn found in the wallet's DepositForBurn logs), so a retry never
   * sends it twice. Undefined when nothing matching is found.
   */
  recover?(input: RecoverInput): Promise<Hex | undefined>;
}
