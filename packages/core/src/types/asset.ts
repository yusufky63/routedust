import type { Address, SourceProvenance } from "./common";

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
