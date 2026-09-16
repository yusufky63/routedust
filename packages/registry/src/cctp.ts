import type { Address } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

/**
 * Circle CCTP (current version, "V2") testnet deployment. The same addresses
 * are deployed on every supported EVM testnet. Never reuse legacy CCTP V1
 * TokenMessenger addresses from old tutorials.
 */
export const CCTP_V2_TESTNET = {
  tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Address,
  messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as Address,
  tokenMinterV2: "0xb43db544E2c27092c107639Ad201b3dEfAbcF192" as Address,
  messageV2: "0xbaC0179bB358A8936169a63408C8481D582390C4" as Address,
  irisApiBase: "https://iris-api-sandbox.circle.com",
  /** minFinalityThreshold values. */
  finality: { fast: 1000, standard: 2000 } as const,
  source: SOURCES.circleCctpContracts,
} as const;

export interface CctpDomainConfig {
  chainId: number;
  domain: number;
  /** Fast Transfer supported when this chain is the SOURCE. */
  fastTransfer: boolean;
  /** Upfront (TokenMessengerWithFees) fees supported. */
  upfrontFees: boolean;
  note?: string;
}

/** Domains are shared between mainnet and its official testnet. */
export const CCTP_DOMAINS: CctpDomainConfig[] = [
  { chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, domain: 0, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.AVALANCHE_FUJI, domain: 1, fastTransfer: false, upfrontFees: true, note: "standard already fast" },
  { chainId: CHAIN_IDS.OP_SEPOLIA, domain: 2, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.ARBITRUM_SEPOLIA, domain: 3, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.BASE_SEPOLIA, domain: 6, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.POLYGON_AMOY, domain: 7, fastTransfer: false, upfrontFees: true },
  { chainId: CHAIN_IDS.UNICHAIN_SEPOLIA, domain: 10, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.WORLD_CHAIN_SEPOLIA, domain: 14, fastTransfer: true, upfrontFees: true },
  { chainId: CHAIN_IDS.MONAD_TESTNET, domain: 15, fastTransfer: false, upfrontFees: false, note: "upfront fees not supported" },
  { chainId: CHAIN_IDS.ARC_TESTNET, domain: 26, fastTransfer: false, upfrontFees: true, note: "USDC is the gas asset" },
];

export function cctpDomainFor(chainId: number): CctpDomainConfig | undefined {
  return CCTP_DOMAINS.find((d) => d.chainId === chainId);
}

export function chainIdForDomain(domain: number): number | undefined {
  return CCTP_DOMAINS.find((d) => d.domain === domain)?.chainId;
}

/** Circle Gateway testnet support (spec section 5.4). Optional consolidation strategy. */
export const CIRCLE_GATEWAY_TESTNET_CHAIN_IDS: number[] = [
  CHAIN_IDS.ARBITRUM_SEPOLIA,
  CHAIN_IDS.ARC_TESTNET,
  CHAIN_IDS.AVALANCHE_FUJI,
  CHAIN_IDS.BASE_SEPOLIA,
  CHAIN_IDS.ETHEREUM_SEPOLIA,
  CHAIN_IDS.OP_SEPOLIA,
  CHAIN_IDS.POLYGON_AMOY,
  CHAIN_IDS.UNICHAIN_SEPOLIA,
  CHAIN_IDS.WORLD_CHAIN_SEPOLIA,
];
