import type { Asset, AssetNode } from "./asset";
import type { FaucetRef } from "./chain";
import type { Address, SourceProvenance } from "./common";

export type RouteEdgeType =
  | "WRAP"
  | "UNWRAP"
  | "SWAP"
  | "CCTP"
  | "CIRCLE_GATEWAY"
  | "OP_STANDARD_BRIDGE"
  | "SUPERCHAIN_INTEROP"
  | "ACROSS"
  | "LIFI"
  | "STARGATE"
  | "LAYERZERO_OFT"
  | "WORMHOLE_NTT"
  | "WORMHOLE_WRAPPED"
  | "HYPERLANE_WARP";

export const BRIDGE_EDGE_TYPES: ReadonlySet<RouteEdgeType> = new Set<RouteEdgeType>([
  "CCTP",
  "CIRCLE_GATEWAY",
  "OP_STANDARD_BRIDGE",
  "SUPERCHAIN_INTEROP",
  "ACROSS",
  "LIFI",
  "STARGATE",
  "LAYERZERO_OFT",
  "WORMHOLE_NTT",
  "WORMHOLE_WRAPPED",
  "HYPERLANE_WARP",
]);

export type OutputCanonicality = "NATIVE" | "CANONICAL" | "ISSUER_MANAGED" | "WRAPPED";

/** Runtime validity levels (spec section 23). */
export type EdgeHealth = "STRUCTURAL" | "QUOTED" | "SIMULATED" | "DEGRADED" | "UNAVAILABLE";

export type ReliabilityClass = "CANONICAL" | "ISSUER" | "LIQUIDITY" | "BEST_EFFORT_TESTNET";

export type RouteMode = "BEST_OUTPUT" | "FEWEST_TX" | "FASTEST" | "NATIVE_ONLY" | "MAX_COVERAGE";

export const ROUTE_MODES: RouteMode[] = [
  "BEST_OUTPUT",
  "FEWEST_TX",
  "FASTEST",
  "NATIVE_ONLY",
  "MAX_COVERAGE",
];

export interface EdgeTrustMetadata {
  routeOwner?: string;
  issuerApproved?: boolean;
  sourceRegistry?: string;
  securityModelLabel?: string;
  registryProvenance?: "official-registry" | "custom";
}

/**
 * Level 0: a structurally possible edge discovered from registries / live
 * capability APIs. It is NOT executable until it is quoted.
 */
export interface CapabilityEdge {
  id: string;
  provider: string;
  type: RouteEdgeType;
  from: AssetNode;
  to: AssetNode;
  crossChain: boolean;
  requiresApproval: boolean;
  requiresSourceGas: boolean;
  requiresDestinationGas: boolean;
  outputCanonicality: OutputCanonicality;
  reliabilityClass: ReliabilityClass;
  /** Baseline gas units used for gas reserve before a live quote exists. */
  baselineGasUnits: bigint;
  /** Baseline latency estimate in seconds. */
  baselineSeconds: number;
  source: SourceProvenance;
  trustMetadata?: EdgeTrustMetadata;
  /** Provider-specific payload (pool address, fee tier, domains ...). */
  meta?: Record<string, unknown>;
}

export interface Quote {
  provider: string;
  amountIn: bigint;
  /** Expected output in `to` asset units. */
  amountOut: bigint;
  /** Output after slippage tolerance / minimum accepted. */
  minAmountOut: bigint;
  /** Protocol fee expressed in output-asset units. */
  feeOut: bigint;
  estimatedGasUnits: bigint;
  estimatedSeconds: number;
  txCount: number;
  quotedAt: number;
  /** ms epoch. Never execute after this. */
  expiresAt: number;
  priceImpactBps?: number;
  /** Provider-specific payload needed to build transactions. */
  raw?: unknown;
}

/** Level 1+: a capability edge with a live quote. */
export interface RouteEdge extends CapabilityEdge {
  quote: Quote;
  health: EdgeHealth;
  healthNote?: string;
}

export interface ScoreBreakdown {
  normalizedOutput: number;
  gasPenalty: number;
  protocolFeePenalty: number;
  slippagePenalty: number;
  latencyPenalty: number;
  txCountPenalty: number;
  reliabilityPenalty: number;
  wrappedOutputPenalty: number;
  total: number;
}

export interface RouteCandidate {
  id: string;
  sourceChainId: number;
  sourceAsset: Asset;
  amountIn: bigint;
  destination: AssetNode;
  edges: RouteEdge[];
  amountOut: bigint;
  minAmountOut: bigint;
  txCount: number;
  swapCount: number;
  bridgeCount: number;
  estimatedSeconds: number;
  /** Total gas units the SOURCE chain must pay for. */
  sourceGasUnits: bigint;
  outputCanonicality: OutputCanonicality;
  reliabilityClass: ReliabilityClass;
  requiresSourceGas: boolean;
  requiresDestinationGas: boolean;
  /** Minimum health across edges. */
  health: EdgeHealth;
  /** Worst DEX price impact along the path, basis points (undefined when no swap reported one). */
  priceImpactBps?: number;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
  /** Set when a mode filter rejected this candidate (still shown, greyed). */
  excludedBy?: string;
}

export type NoRouteReason =
  | "NO_LIQUIDITY"
  | "NO_BRIDGE_FOR_ASSET"
  | "INSUFFICIENT_SOURCE_GAS"
  | "AMOUNT_BELOW_MINIMUM"
  | "OUTPUT_IS_WRAPPED_AND_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "NO_ACTIVE_SOLVER"
  | "UNVERIFIED_ASSET"
  | "NO_STRUCTURAL_PATH"
  | "ALREADY_AT_TARGET"
  | "BELOW_DUST_THRESHOLD";

export type SourceStatus = "ROUTABLE" | "TARGET" | "NEED_GAS" | "NO_ROUTE" | "PARTIAL" | "SKIPPED";

export interface GasReserveInfo {
  /** Native asset balance on the source chain. */
  nativeBalance: bigint;
  /** Native units reserved for gas. */
  reserve: bigint;
  /** Native units missing when the balance cannot cover the reserve. */
  shortfall: bigint;
  estimatedGasUnits: bigint;
  maxFeePerGas: bigint;
  safetyMultiplier: number;
}

/** Per (source chain, source asset) planning result. */
export interface SourcePlan {
  id: string;
  sourceChainId: number;
  asset: Asset;
  balance: bigint;
  /** Amount the planner is willing to route (balance minus gas reserve for native). */
  routable: bigint;
  gas: GasReserveInfo;
  status: SourceStatus;
  reason?: NoRouteReason;
  candidates: RouteCandidate[];
  selected?: RouteCandidate;
  faucets: FaucetRef[];
  notes: string[];
  /** Set on PARTIAL plans: a provider capped the amount it can take right now. */
  limit?: {
    maxAmountIn: bigint;
    provider: string;
    edgeType: RouteEdgeType;
    /** Why the amount was capped. */
    reason: "liquidity" | "price-impact";
    /** Price impact at the capped amount, when the reason is price impact. */
    priceImpactBps?: number;
  };
}

export interface ConsolidationPlan {
  id: string;
  wallet: Address;
  destination: AssetNode;
  mode: RouteMode;
  createdAt: number;
  sources: SourcePlan[];
  /** Sum of selected candidate outputs in destination units. */
  totalOut: bigint;
  stats: {
    networks: number;
    assets: number;
    routable: number;
    needGas: number;
    noRoute: number;
    target: number;
  };
}

export interface PlannerLimits {
  maxSwaps: number;
  maxBridges: number;
  maxTotalSteps: number;
  maxCandidatesPerAsset: number;
  allowWrappedOutput: boolean;
  experimentalRoutes: boolean;
  slippageBps: number;
  gasSafetyMultiplier: number;
  /** Above this DEX price impact the planner shrinks the amount (PARTIAL) instead of dumping. */
  maxPriceImpactBps: number;
  /** Ignore balances below this many raw base units of the asset (keyed by asset id). */
  dustThresholds?: Record<string, bigint>;
}

export const DEFAULT_PLANNER_LIMITS: PlannerLimits = {
  maxSwaps: 2,
  maxBridges: 2,
  maxTotalSteps: 5,
  maxCandidatesPerAsset: 8,
  allowWrappedOutput: false,
  experimentalRoutes: false,
  slippageBps: 100,
  gasSafetyMultiplier: 1.25,
  maxPriceImpactBps: 500,
};
