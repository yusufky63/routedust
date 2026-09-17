import type { Address } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export interface KnownTestToken {
  chainId: number;
  address: Address;
  canonicalAssetId: string;
  symbol: string;
  name: string;
  decimals: number;
  issuer: string;
  source: (typeof SOURCES)[keyof typeof SOURCES];
}

/**
 * Widely used, issuer-published test tokens. Verified on-chain
 * (symbol/decimals/name) with scripts/probe-tokens.ts. They are listed as
 * verified assets so the planner may route them through DEX pools without
 * the unverified-token policy, but no bridge edge exists for them: they can
 * only leave a chain by being sold into USDC or native first.
 */
export const KNOWN_TEST_TOKENS: KnownTestToken[] = [
  { chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", canonicalAssetId: "EURC", symbol: "EURC", name: "EURC (Circle test)", decimals: 6, issuer: "Circle", source: SOURCES.circleEurc },
  { chainId: CHAIN_IDS.BASE_SEPOLIA, address: "0x808456652fdb597867f38412077A9182bf77359F", canonicalAssetId: "EURC", symbol: "EURC", name: "EURC (Circle test)", decimals: 6, issuer: "Circle", source: SOURCES.circleEurc },
  { chainId: CHAIN_IDS.AVALANCHE_FUJI, address: "0x5E44db7996c682E92a960b65AC713a54AD815c6B", canonicalAssetId: "EURC", symbol: "EURC", name: "EURC (Circle test)", decimals: 6, issuer: "Circle", source: SOURCES.circleEurc },
  { chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
  { chainId: CHAIN_IDS.BASE_SEPOLIA, address: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
  { chainId: CHAIN_IDS.ARBITRUM_SEPOLIA, address: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
  { chainId: CHAIN_IDS.OP_SEPOLIA, address: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
  { chainId: CHAIN_IDS.AVALANCHE_FUJI, address: "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
  { chainId: CHAIN_IDS.POLYGON_AMOY, address: "0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904", canonicalAssetId: "LINK", symbol: "LINK", name: "ChainLink Token (test)", decimals: 18, issuer: "Chainlink", source: SOURCES.chainlinkTokens },
];
