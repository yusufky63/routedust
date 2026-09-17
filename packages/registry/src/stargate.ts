import type { Address, SourceProvenance } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export interface StargateNativePool {
  chainId: number;
  /** LayerZero V2 endpoint id. */
  eid: number;
  /** StargatePoolNative: token() == address(0), ETH in, ETH out. */
  pool: Address;
  source: SourceProvenance;
}

/**
 * Stargate V2 native ETH pools on testnets (from the stargate-v2 repository
 * deployments and the testnet metadata API). Stargate's testnet USDC pools use
 * Stargate's own mock USDC, not Circle's, so only the ETH pools are routes.
 * Liquidity is bounded per path by paths(dstEid).credit, which the adapter
 * reads live and surfaces as a provider limit.
 */
export const STARGATE_NATIVE_POOLS: StargateNativePool[] = [
  { chainId: CHAIN_IDS.ETHEREUM_SEPOLIA, eid: 40161, pool: "0x9Cc7e185162Aa5D1425ee924D97a87A0a34A0706", source: SOURCES.stargateTestnet },
  { chainId: CHAIN_IDS.ARBITRUM_SEPOLIA, eid: 40231, pool: "0x6fddB6270F6c71f31B62AE0260cfa8E2e2d186E0", source: SOURCES.stargateTestnet },
  { chainId: CHAIN_IDS.OP_SEPOLIA, eid: 40232, pool: "0xa31dCc5C71E25146b598bADA33E303627D7fC97e", source: SOURCES.stargateTestnet },
];

export const LAYERZERO_SCAN_TESTNET_API = "https://scan-testnet.layerzero-api.com/v1";
