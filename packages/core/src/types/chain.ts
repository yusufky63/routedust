import type { Address, SourceProvenance, VmKind } from "./common";

export type FaucetSource = "CHAIN_OFFICIAL" | "PROTOCOL_OFFICIAL" | "THIRD_PARTY";
export type FaucetHealth = "VERIFIED_RECENTLY" | "UNKNOWN" | "REPORTED_DOWN";

export interface FaucetRef {
  id: string;
  /** 0 means a multi-chain directory / ecosystem faucet. */
  chainId: number;
  /** Additional chains a multi-chain faucet covers. */
  chainIds?: number[];
  /** Canonical asset id supplied (ETH, USDC, MON ...). */
  assetId: string;
  name: string;
  url: string;
  source: FaucetSource;
  requiresAuth?: boolean;
  notes?: string;
  lastVerifiedAt: string;
  health?: FaucetHealth;
}

/**
 * Native gas asset description. `decimals` is what eth_getBalance returns.
 * Arc is the important edge case: native USDC is 18-decimal at the RPC level
 * while its ERC-20 interface is 6-decimal.
 */
export interface NativeAssetConfig {
  canonicalAssetId: string;
  symbol: string;
  name: string;
  decimals: number;
  wrappedAddress?: Address;
  wrappedSymbol?: string;
  /** Set only after the wrapped contract was verified on-chain. */
  wrappedVerified?: boolean;
  erc20Mirror?: {
    address: Address;
    decimals: number;
  };
}

export type FinalityKind = "deterministic" | "probabilistic" | "rollup";

export interface OpStackConfig {
  l1ChainId: number;
  l1StandardBridge: Address;
  l2StandardBridge: Address;
  optimismPortal?: Address;
}

export interface ChainConfig {
  id: number;
  key: string;
  name: string;
  shortName: string;
  testnet: true;
  vm: VmKind;
  tier: 1 | 2;
  nativeAsset: NativeAssetConfig;
  rpcUrls: string[];
  explorerUrl: string;
  cctpDomain?: number;
  opStack?: OpStackConfig;
  finality?: {
    kind: FinalityKind;
    confirmations?: number;
  };
  /** Multicall3 address when deployed (defaults to the canonical address). */
  multicall3?: Address;
  faucets: FaucetRef[];
  source: SourceProvenance;
  /** Small marker color only. Never a card background. */
  color?: string;
}
