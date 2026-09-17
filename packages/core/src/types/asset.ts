import type { Address, Hex, SourceProvenance } from "./common";

export type AssetKind = "NATIVE" | "ERC20" | "WRAPPED_NATIVE";

export type AssetRepresentation =
  | "NATIVE"
  | "CIRCLE_NATIVE"
  | "CANONICAL"
  | "WRAPPED_NATIVE"
  | "WORMHOLE_WRAPPED"
  | "WORMHOLE_NTT"
  | "STARGATE_POOL"
  | "STARGATE_OFT"
  | "LAYERZERO_OFT"
  | "HYPERLANE_WARP"
  | "UNKNOWN";

/**
 * Concrete asset on a concrete chain. Identity is chain + address (or native)
 * + representation. Symbol and name are display data only.
 */
export interface Asset {
  /** "chainId:native" or "chainId:lowercase-address" */
  id: string;
  chainId: number;
  canonicalAssetId: string;
  kind: AssetKind;
  address?: Address;
  decimals: number;
  symbol: string;
  name: string;
  representation: AssetRepresentation;
  origin?: {
    chainId: number;
    address?: string;
  };
  issuer?: string;
  verified: boolean;
  source?: SourceProvenance;
  /** Runtime transfer-sanity result for unverified tokens (fee-on-transfer, blocked transfers). */
  risk?: TokenRisk;
}

export type TransferSanity = "ok" | "fee" | "blocked" | "unknown";

export interface TokenRisk {
  transfer: TransferSanity;
  /** Fee taken on a plain transfer, basis points (when transfer === "fee"). */
  feeBps?: number;
  checkedAt: number;
  detail?: string;
  /** Storage slot of balanceOf(holder) found by the sanity check; reused by the swap simulation. */
  balanceSlot?: Hex;
  /** Result of a real router swap simulation (state override): reverts or output loss versus the quoter. */
  sell?: "ok" | "blocked" | "fee" | "unknown";
  sellDetail?: string;
}

/** Graph node: (chain, canonical asset, concrete representation). */
export interface AssetNode {
  chainId: number;
  canonicalAssetId: string;
  representation: AssetRepresentation;
  /** Concrete asset id backing this node. */
  assetId: string;
}

export interface AssetBalance {
  asset: Asset;
  raw: bigint;
  /** Human-readable, using the asset's own decimals. */
  formatted: string;
  fetchedAt: number;
  error?: string;
}

export interface ChainScanResult {
  chainId: number;
  balances: AssetBalance[];
  ok: boolean;
  error?: string;
  latencyMs?: number;
  blockNumber?: bigint;
}

export interface WalletScan {
  wallet: Address;
  scannedAt: number;
  chains: ChainScanResult[];
}
