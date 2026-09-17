import type { Address, SourceProvenance } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export interface OpStandardBridgeDeployment {
  l2ChainId: number;
  l1ChainId: number;
  l1StandardBridge: Address;
  l2StandardBridge: Address;
  source: SourceProvenance;
}

/**
 * OP Stack canonical L1 <-> L2 Standard Bridge deployments. Only L1 -> L2 ETH
 * deposits are exposed as edges for now; withdrawals are slow and multi-step.
 */
export const OP_STANDARD_BRIDGES: OpStandardBridgeDeployment[] = [
  {
    l2ChainId: CHAIN_IDS.OP_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.optimismDocs,
  },
  {
    l2ChainId: CHAIN_IDS.BASE_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0xfd0Bf71F60660E2f608ed56e1659C450eB113120",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.baseFunds,
  },
  {
    l2ChainId: CHAIN_IDS.GIWA_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.giwaDocs,
  },
  {
    l2ChainId: CHAIN_IDS.INK_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0x33f60714BbD74d62b66D79213C348614DE51901C",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.inkDocs,
  },
];

export function opBridgeForL2(l2ChainId: number): OpStandardBridgeDeployment | undefined {
  return OP_STANDARD_BRIDGES.find((b) => b.l2ChainId === l2ChainId);
}

/** Across testnet environment. The authoritative list comes from /available-routes at runtime. */
export const ACROSS_TESTNET = {
  apiBase: "https://testnet.across.to/api",
  /** Static hint only; never used to manufacture routes. */
  knownChainIds: [
    CHAIN_IDS.ETHEREUM_SEPOLIA,
    CHAIN_IDS.BASE_SEPOLIA,
    CHAIN_IDS.OP_SEPOLIA,
    CHAIN_IDS.ARBITRUM_SEPOLIA,
    CHAIN_IDS.POLYGON_AMOY,
    CHAIN_IDS.UNICHAIN_SEPOLIA,
  ],
  source: SOURCES.acrossTestnetApi,
} as const;
