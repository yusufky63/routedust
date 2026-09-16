import type { FaucetRef } from "@testnet-router/core";
import { REGISTRY_VERIFIED_AT } from "./sources";

export const CHAIN_IDS = {
  ETHEREUM_SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  OP_SEPOLIA: 11155420,
  ARBITRUM_SEPOLIA: 421614,
  ARC_TESTNET: 5042002,
  MONAD_TESTNET: 10143,
  AVALANCHE_FUJI: 43113,
  POLYGON_AMOY: 80002,
  UNICHAIN_SEPOLIA: 1301,
  WORLD_CHAIN_SEPOLIA: 4801,
  GIWA_SEPOLIA: 91342,
} as const;

const C = CHAIN_IDS;
const at = REGISTRY_VERIFIED_AT;

const SUPERCHAIN_IDS = [C.OP_SEPOLIA, C.BASE_SEPOLIA, C.UNICHAIN_SEPOLIA, C.WORLD_CHAIN_SEPOLIA];
const CIRCLE_USDC_IDS = [
  C.ETHEREUM_SEPOLIA,
  C.BASE_SEPOLIA,
  C.OP_SEPOLIA,
  C.ARBITRUM_SEPOLIA,
  C.ARC_TESTNET,
  C.MONAD_TESTNET,
  C.AVALANCHE_FUJI,
  C.POLYGON_AMOY,
  C.UNICHAIN_SEPOLIA,
  C.WORLD_CHAIN_SEPOLIA,
];

/**
 * Faucets are external dependencies, not APIs. Never auto-claim; always open
 * externally. `chainId: 0` marks multi-chain faucets / directories.
 */
export const FAUCETS: FaucetRef[] = [
  // Circle test USDC (also Arc gas)
  {
    id: "circle-faucet",
    chainId: 0,
    chainIds: CIRCLE_USDC_IDS,
    assetId: "USDC",
    name: "Circle Faucet",
    url: "https://faucet.circle.com",
    source: "PROTOCOL_OFFICIAL",
    notes: "Circle test USDC on supported testnets. On Arc Testnet USDC is also the gas asset.",
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  // Ethereum Sepolia ETH
  {
    id: "ethereum-org-directory",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "ethereum.org faucet directory",
    url: "https://ethereum.org/developers/docs/networks/",
    source: "CHAIN_OFFICIAL",
    notes: "Directory of Sepolia faucets maintained by ethereum.org",
    lastVerifiedAt: at,
  },
  {
    id: "alchemy-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "Alchemy Sepolia Faucet",
    url: "https://www.alchemy.com/faucets/ethereum-sepolia",
    source: "THIRD_PARTY",
    requiresAuth: true,
    lastVerifiedAt: at,
  },
  {
    id: "google-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "Google Cloud Web3 Faucet",
    url: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
    source: "THIRD_PARTY",
    requiresAuth: true,
    lastVerifiedAt: at,
  },
  {
    id: "quicknode-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "QuickNode Sepolia Faucet",
    url: "https://faucet.quicknode.com/ethereum/sepolia",
    source: "THIRD_PARTY",
    requiresAuth: true,
    lastVerifiedAt: at,
  },
  // Superchain
  {
    id: "superchain-faucet",
    chainId: 0,
    chainIds: SUPERCHAIN_IDS,
    assetId: "ETH",
    name: "Superchain Faucet",
    url: "https://console.optimism.io/faucet",
    source: "PROTOCOL_OFFICIAL",
    requiresAuth: true,
    notes: "OP Sepolia, Base Sepolia, Unichain Sepolia, World Chain Sepolia, Ink, Zora, Mode, Lisk and other Superchain testnets",
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  {
    id: "base-get-funds",
    chainId: C.BASE_SEPOLIA,
    assetId: "ETH",
    name: "Base: get testnet funds",
    url: "https://docs.base.org/get-started/get-funds",
    source: "CHAIN_OFFICIAL",
    notes: "Official Base list of Base Sepolia faucets",
    lastVerifiedAt: at,
  },
  // Arbitrum Sepolia
  {
    id: "alchemy-arbitrum-sepolia",
    chainId: C.ARBITRUM_SEPOLIA,
    assetId: "ETH",
    name: "Alchemy Arbitrum Sepolia Faucet",
    url: "https://www.alchemy.com/faucets/arbitrum-sepolia",
    source: "THIRD_PARTY",
    requiresAuth: true,
    lastVerifiedAt: at,
  },
  // Monad
  {
    id: "monad-faucet",
    chainId: C.MONAD_TESTNET,
    assetId: "MON",
    name: "Official Monad Faucet",
    url: "https://faucet.monad.xyz",
    source: "CHAIN_OFFICIAL",
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  // Avalanche Fuji
  {
    id: "avalanche-builder-faucet",
    chainId: C.AVALANCHE_FUJI,
    assetId: "AVAX",
    name: "Avalanche Builder Hub Faucet",
    url: "https://build.avax.network/console/primary-network/faucet",
    source: "CHAIN_OFFICIAL",
    requiresAuth: true,
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  // Polygon Amoy
  {
    id: "polygon-faucet",
    chainId: C.POLYGON_AMOY,
    assetId: "POL",
    name: "Polygon Faucet",
    url: "https://faucet.polygon.technology",
    source: "CHAIN_OFFICIAL",
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  // World Chain Sepolia
  {
    id: "alchemy-world-chain-sepolia",
    chainId: C.WORLD_CHAIN_SEPOLIA,
    assetId: "ETH",
    name: "Alchemy World Chain Sepolia Faucet",
    url: "https://www.alchemy.com/faucets/world-chain-sepolia",
    source: "THIRD_PARTY",
    requiresAuth: true,
    lastVerifiedAt: at,
  },
  // GIWA Sepolia
  {
    id: "giwa-faucet",
    chainId: C.GIWA_SEPOLIA,
    assetId: "ETH",
    name: "Official GIWA Faucet",
    url: "https://faucet.giwa.io/",
    source: "CHAIN_OFFICIAL",
    notes: "Up to 0.005 ETH per 24h",
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  {
    id: "nodit-giwa-faucet",
    chainId: C.GIWA_SEPOLIA,
    assetId: "ETH",
    name: "Nodit GIWA Sepolia Faucet",
    url: "https://faucet.lambda256.io/giwa-sepolia",
    source: "THIRD_PARTY",
    notes: "0.01 ETH per 24h, listed in the GIWA docs",
    lastVerifiedAt: at,
  },
  // Wormhole directory (fallback)
  {
    id: "wormhole-faucet-directory",
    chainId: 0,
    chainIds: [
      C.BASE_SEPOLIA,
      C.ARBITRUM_SEPOLIA,
      C.MONAD_TESTNET,
      C.OP_SEPOLIA,
      C.POLYGON_AMOY,
      C.WORLD_CHAIN_SEPOLIA,
      C.ETHEREUM_SEPOLIA,
      C.AVALANCHE_FUJI,
    ],
    assetId: "*",
    name: "Wormhole Testnet Faucet Directory",
    url: "https://wormhole.com/docs/reference/testnet-faucets/",
    source: "PROTOCOL_OFFICIAL",
    notes: "Directory of faucets across many testnets; fallback source",
    lastVerifiedAt: at,
  },
];

export function faucetsForChain(chainId: number): FaucetRef[] {
  return FAUCETS.filter((f) => f.chainId === chainId || f.chainIds?.includes(chainId));
}

export function faucetById(id: string): FaucetRef | undefined {
  return FAUCETS.find((f) => f.id === id);
}
