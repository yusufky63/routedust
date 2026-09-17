import type { Address } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

/**
 * Circle Gateway testnet: one GatewayWallet / GatewayMinter pair deployed at
 * the same address on every supported EVM testnet (ERC1967 proxies, verified
 * on-chain via domain()). Domains are the CCTP domains. Deposits become
 * spendable after source finality (~65 Ethereum blocks for Sepolia and its
 * L2s, seconds on Fuji/Amoy/Arc); the 7-day withdrawal delay applies only to
 * taking deposits back out, not to transfers.
 */
export const CIRCLE_GATEWAY_TESTNET = {
  wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as Address,
  minter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as Address,
  apiBase: "https://gateway-api-testnet.circle.com",
  /** EIP-712 domain intentionally has no chainId / verifyingContract (Circle's design). */
  eip712: { name: "GatewayWallet", version: "1" },
  chainIds: [
    CHAIN_IDS.ETHEREUM_SEPOLIA,
    CHAIN_IDS.BASE_SEPOLIA,
    CHAIN_IDS.ARBITRUM_SEPOLIA,
    CHAIN_IDS.OP_SEPOLIA,
    CHAIN_IDS.AVALANCHE_FUJI,
    CHAIN_IDS.POLYGON_AMOY,
    CHAIN_IDS.UNICHAIN_SEPOLIA,
    CHAIN_IDS.ARC_TESTNET,
    CHAIN_IDS.SEI_TESTNET,
    CHAIN_IDS.SONIC_TESTNET,
    CHAIN_IDS.WORLD_CHAIN_SEPOLIA,
  ] as number[],
  /** Chains whose deposits finalise within seconds; the rest wait for ~65 Ethereum blocks. */
  fastFinalityChainIds: [CHAIN_IDS.AVALANCHE_FUJI, CHAIN_IDS.POLYGON_AMOY, CHAIN_IDS.ARC_TESTNET, CHAIN_IDS.SEI_TESTNET, CHAIN_IDS.SONIC_TESTNET] as number[],
  source: SOURCES.circleGateway,
} as const;
