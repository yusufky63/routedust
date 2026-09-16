import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

/**
 * Circle CCTP testnet directory as published on the supported-chains page.
 * Circle publishes domains, not EVM chain IDs. `chainId` is VERIFIED for the
 * chains in this registry; otherwise it is the usual public testnet id and is
 * cross-checked against chainid.network at runtime before it is trusted.
 */
export interface CctpDirectoryEntry {
  name: string;
  domain: number;
  vm: "EVM" | "SVM" | "OTHER";
  chainId?: number;
  chainIdConfidence: "verified" | "assumed";
  /** Lower-case keywords that must all appear in the chainid.network name. */
  keywords: string[];
  fastTransfer?: boolean;
  note?: string;
}

const V = "verified" as const;
const A = "assumed" as const;

export const CCTP_TESTNET_DIRECTORY: CctpDirectoryEntry[] = [
  { name: "Ethereum Sepolia", domain: 0, vm: "EVM", chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, chainIdConfidence: V, keywords: ["sepolia"], fastTransfer: true },
  { name: "Avalanche Fuji", domain: 1, vm: "EVM", chainId: CHAIN_IDS.AVALANCHE_FUJI, chainIdConfidence: V, keywords: ["fuji"] },
  { name: "OP Sepolia", domain: 2, vm: "EVM", chainId: CHAIN_IDS.OP_SEPOLIA, chainIdConfidence: V, keywords: ["op sepolia"], fastTransfer: true },
  { name: "Arbitrum Sepolia", domain: 3, vm: "EVM", chainId: CHAIN_IDS.ARBITRUM_SEPOLIA, chainIdConfidence: V, keywords: ["arbitrum sepolia"], fastTransfer: true },
  { name: "Solana Devnet", domain: 5, vm: "SVM", chainIdConfidence: A, keywords: ["solana"] },
  { name: "Base Sepolia", domain: 6, vm: "EVM", chainId: CHAIN_IDS.BASE_SEPOLIA, chainIdConfidence: V, keywords: ["base sepolia"], fastTransfer: true },
  { name: "Polygon Amoy", domain: 7, vm: "EVM", chainId: CHAIN_IDS.POLYGON_AMOY, chainIdConfidence: V, keywords: ["amoy"] },
  { name: "Aptos Testnet", domain: 9, vm: "OTHER", chainIdConfidence: A, keywords: ["aptos"] },
  { name: "Unichain Sepolia", domain: 10, vm: "EVM", chainId: CHAIN_IDS.UNICHAIN_SEPOLIA, chainIdConfidence: V, keywords: ["unichain sepolia"], fastTransfer: true },
  { name: "Linea Sepolia", domain: 11, vm: "EVM", chainId: 59141, chainIdConfidence: A, keywords: ["linea sepolia"], fastTransfer: true },
  { name: "Codex Testnet", domain: 12, vm: "EVM", chainId: 6513784, chainIdConfidence: A, keywords: ["codex"], fastTransfer: true },
  { name: "Sonic Testnet", domain: 13, vm: "EVM", chainId: 57054, chainIdConfidence: A, keywords: ["sonic", "test"] },
  { name: "World Chain Sepolia", domain: 14, vm: "EVM", chainId: CHAIN_IDS.WORLD_CHAIN_SEPOLIA, chainIdConfidence: V, keywords: ["world chain sepolia"], fastTransfer: true },
  { name: "Monad Testnet", domain: 15, vm: "EVM", chainId: CHAIN_IDS.MONAD_TESTNET, chainIdConfidence: V, keywords: ["monad testnet"], note: "upfront fees not supported" },
  { name: "Sei Testnet", domain: 16, vm: "EVM", chainId: 1328, chainIdConfidence: A, keywords: ["sei", "test"] },
  { name: "BNB Smart Chain Testnet", domain: 17, vm: "EVM", chainId: 97, chainIdConfidence: A, keywords: ["bnb", "test"], note: "USYC only" },
  { name: "XDC Apothem", domain: 18, vm: "EVM", chainId: 51, chainIdConfidence: A, keywords: ["apothem"] },
  { name: "HyperEVM Testnet", domain: 19, vm: "EVM", chainId: 998, chainIdConfidence: A, keywords: ["hyperliquid", "test"] },
  { name: "Ink Sepolia", domain: 21, vm: "EVM", chainId: 763373, chainIdConfidence: A, keywords: ["ink sepolia"], fastTransfer: true },
  { name: "Plume Testnet", domain: 22, vm: "EVM", chainId: 98867, chainIdConfidence: A, keywords: ["plume", "test"], fastTransfer: true },
  { name: "Starknet Sepolia", domain: 25, vm: "OTHER", chainIdConfidence: A, keywords: ["starknet"] },
  { name: "Arc Testnet", domain: 26, vm: "EVM", chainId: CHAIN_IDS.ARC_TESTNET, chainIdConfidence: V, keywords: ["arc", "test"], note: "USDC is the gas asset" },
  { name: "Stellar Testnet", domain: 27, vm: "OTHER", chainIdConfidence: A, keywords: ["stellar"] },
  { name: "EDGE Testnet", domain: 28, vm: "EVM", chainIdConfidence: A, keywords: ["edge", "test"], fastTransfer: true },
  { name: "Injective Testnet", domain: 29, vm: "EVM", chainId: 1439, chainIdConfidence: A, keywords: ["injective", "test"] },
  { name: "Morph Hoodi", domain: 30, vm: "EVM", chainId: 2810, chainIdConfidence: A, keywords: ["morph", "hoodi"], fastTransfer: true },
  { name: "Pharos Testnet", domain: 31, vm: "EVM", chainIdConfidence: A, keywords: ["pharos", "test"] },
  { name: "Cronos Testnet", domain: 32, vm: "EVM", chainId: 338, chainIdConfidence: A, keywords: ["cronos", "test"] },
  { name: "Plasma Testnet", domain: 33, vm: "EVM", chainId: 9746, chainIdConfidence: A, keywords: ["plasma", "test"] },
  { name: "X Layer Testnet", domain: 37, vm: "EVM", chainId: 1952, chainIdConfidence: A, keywords: ["x layer", "test"], fastTransfer: true },
];

export const CCTP_DIRECTORY_SOURCE = SOURCES.circleCctpDomains;

/** Public registries that expose chain support programmatically. */
export const COVERAGE_FEEDS = {
  chainid: "https://chainid.network/chains.json",
  uniswap: "https://developers.uniswap.org/deployments.json",
  across: "https://testnet.across.to/api/chains",
  lifi: "https://li.quest/v1/chains?chainTypes=EVM",
  layerzero: "https://metadata.layerzero-api.com/v1/metadata/deployments",
  hyperlane: "https://raw.githubusercontent.com/hyperlane-xyz/hyperlane-registry/main/chains/metadata.yaml",
  circleDocs: SOURCES.circleCctpDomains.url,
} as const;
