import type { Address, SourceProvenance } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export interface HyperlaneWarpToken {
  chainId: number;
  /** Hyperlane domain id (equal to the chain id on every listed testnet; verified via domains()). */
  domain: number;
  /** HypERC20Collateral router holding the collateral. */
  router: Address;
  /** Collateral token: Circle USDC on that chain (verified via wrappedToken()). */
  collateral: Address;
}

export interface HyperlaneWarpRoute {
  id: string;
  name: string;
  /** Registry config file under deployments/warp_routes/USDC. */
  configFile: string;
  tokens: HyperlaneWarpToken[];
  source: SourceProvenance;
  note?: string;
}

const C = CHAIN_IDS;

/**
 * Hyperlane USDC warp routes on testnets that are backed by Circle CCTP
 * (TokenBridgeCctp collateral routers). The Hyperlane relayer delivers the
 * message and submits the CCTP mint, so the wallet needs no destination gas;
 * the interchain gas payment is quoted on-chain and paid as msg.value.
 * Router addresses come from the Hyperlane registry; connections are
 * re-verified with routers(domain) at discovery time.
 */
export const HYPERLANE_WARP_ROUTES: HyperlaneWarpRoute[] = [
  {
    id: "usdc-testnet-cctp",
    name: "USDC · Hyperlane CCTP route",
    configFile: "deployments/warp_routes/USDC/testnet-cctp-config.yaml",
    tokens: [
      { chainId: C.ETHEREUM_SEPOLIA, domain: C.ETHEREUM_SEPOLIA, router: "0x352f1c7ffa598d0698c1D8D2fCAb02511c6fF3e9", collateral: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
      { chainId: C.BASE_SEPOLIA, domain: C.BASE_SEPOLIA, router: "0x020dEE96414703c457322eed8504946583a7dd24", collateral: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
      { chainId: C.OP_SEPOLIA, domain: C.OP_SEPOLIA, router: "0xB0A06A5f47D335F5d94D4D8620BCaDF320a159AC", collateral: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7" },
      { chainId: C.ARBITRUM_SEPOLIA, domain: C.ARBITRUM_SEPOLIA, router: "0x61714300b991Cfc2BD336cb1745F01463163A988", collateral: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
    ],
    source: SOURCES.hyperlaneRegistry,
  },
  {
    id: "usdc-testnet-cctp-v2-fast",
    name: "USDC · Hyperlane CCTP v2 fast route",
    configFile: "deployments/warp_routes/USDC/testnet-cctp-v2-fast-config.yaml",
    tokens: [
      { chainId: C.ETHEREUM_SEPOLIA, domain: C.ETHEREUM_SEPOLIA, router: "0xe0F3680b09751b965CFA24f02f5aa58f0E12343a", collateral: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
      { chainId: C.ARBITRUM_SEPOLIA, domain: C.ARBITRUM_SEPOLIA, router: "0x7f37ca42A1a39f736339CE12FC2eB8e9EA88FFe5", collateral: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
    ],
    source: SOURCES.hyperlaneRegistry,
    note: "Fast Transfer fee (bps) is charged in USDC on top of the interchain gas payment",
  },
  {
    id: "usdc-arbitrumsepolia-basesepolia-cctp-v2",
    name: "USDC · Hyperlane CCTP v2 route",
    configFile: "deployments/warp_routes/USDC/arbitrumsepolia-basesepolia-cctp-v2-config.yaml",
    tokens: [
      { chainId: C.ARBITRUM_SEPOLIA, domain: C.ARBITRUM_SEPOLIA, router: "0xbfcE950a54a2052aec323c8884F034373Ca9CAbD", collateral: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
      { chainId: C.BASE_SEPOLIA, domain: C.BASE_SEPOLIA, router: "0x6AD4F1CCBB4e897eFbBb2A62c7ccbBd7fe941848", collateral: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    ],
    source: SOURCES.hyperlaneRegistry,
  },
];

export const HYPERLANE_REGISTRY_RAW = "https://raw.githubusercontent.com/hyperlane-xyz/hyperlane-registry/main";
