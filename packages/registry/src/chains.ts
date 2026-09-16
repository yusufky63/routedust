import type { ChainConfig } from "@testnet-router/core";
import { CHAIN_IDS, faucetsForChain } from "./faucets";
import { OP_STANDARD_BRIDGES } from "./bridges";
import { SOURCES } from "./sources";

const src = SOURCES.publicRpcProbe;

type ChainSeed = Omit<ChainConfig, "faucets" | "testnet" | "vm" | "source" | "opStack"> & {
  source?: ChainConfig["source"];
};

const seeds: ChainSeed[] = [
  {
    id: CHAIN_IDS.ETHEREUM_SEPOLIA,
    key: "ethereum-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://eth-sepolia.blockscout.com" },
    name: "Ethereum Sepolia",
    shortName: "Sepolia",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org", "https://1rpc.io/sepolia"],
    explorerUrl: "https://sepolia.etherscan.io",
    cctpDomain: 0,
    finality: { kind: "probabilistic", confirmations: 2 },
    color: "#627EEA",
  },
  {
    id: CHAIN_IDS.BASE_SEPOLIA,
    key: "base-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://base-sepolia.blockscout.com" },
    name: "Base Sepolia",
    shortName: "Base",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "Base Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x4200000000000000000000000000000000000006",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
    explorerUrl: "https://sepolia.basescan.org",
    cctpDomain: 6,
    finality: { kind: "rollup", confirmations: 1 },
    color: "#0052FF",
  },
  {
    id: CHAIN_IDS.OP_SEPOLIA,
    key: "op-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://optimism-sepolia.blockscout.com" },
    name: "OP Sepolia",
    shortName: "OP",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "OP Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x4200000000000000000000000000000000000006",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://sepolia.optimism.io", "https://optimism-sepolia-rpc.publicnode.com"],
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    cctpDomain: 2,
    finality: { kind: "rollup", confirmations: 1 },
    color: "#FF0420",
  },
  {
    id: CHAIN_IDS.ARBITRUM_SEPOLIA,
    key: "arbitrum-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://arbitrum-sepolia.blockscout.com" },
    name: "Arbitrum Sepolia",
    shortName: "Arbitrum",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "Arbitrum Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"],
    explorerUrl: "https://sepolia.arbiscan.io",
    cctpDomain: 3,
    finality: { kind: "rollup", confirmations: 1 },
    color: "#12AAFF",
  },
  {
    id: CHAIN_IDS.ARC_TESTNET,
    key: "arc-testnet",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://explorer.testnet.arc.io" },
    name: "Arc Testnet",
    shortName: "Arc",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "USDC",
      symbol: "USDC",
      name: "USDC (Arc native gas)",
      // eth_getBalance returns 18 decimals; ERC-20 interface is 6 decimals.
      decimals: 18,
      erc20Mirror: {
        address: "0x3600000000000000000000000000000000000000",
        decimals: 6,
      },
    },
    rpcUrls: ["https://rpc.testnet.arc.io"],
    explorerUrl: "https://explorer.testnet.arc.io",
    cctpDomain: 26,
    finality: { kind: "deterministic", confirmations: 1 },
    source: SOURCES.arcDocs,
    color: "#2775CA",
  },
  {
    id: CHAIN_IDS.MONAD_TESTNET,
    key: "monad-testnet",
    name: "Monad Testnet",
    shortName: "Monad",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "MON",
      symbol: "MON",
      name: "Monad",
      decimals: 18,
      // Wrapped MON deployment not verified on-chain at snapshot time: no WRAP edge.
    },
    rpcUrls: ["https://testnet-rpc.monad.xyz"],
    explorerUrl: "https://testnet.monadexplorer.com",
    cctpDomain: 15,
    finality: { kind: "deterministic", confirmations: 1 },
    source: SOURCES.monadDevelopers,
    color: "#836EF9",
  },
  {
    id: CHAIN_IDS.AVALANCHE_FUJI,
    key: "avalanche-fuji",
    name: "Avalanche Fuji",
    shortName: "Fuji",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "AVAX",
      symbol: "AVAX",
      name: "Avalanche",
      decimals: 18,
      wrappedAddress: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
      wrappedSymbol: "WAVAX",
      wrappedVerified: true,
    },
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc", "https://avalanche-fuji-c-chain-rpc.publicnode.com"],
    explorerUrl: "https://testnet.snowtrace.io",
    cctpDomain: 1,
    finality: { kind: "deterministic", confirmations: 1 },
    source: SOURCES.avalancheDocs,
    color: "#E84142",
  },
  {
    id: CHAIN_IDS.POLYGON_AMOY,
    key: "polygon-amoy",
    name: "Polygon Amoy",
    shortName: "Amoy",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "POL",
      symbol: "POL",
      name: "Polygon Ecosystem Token",
      decimals: 18,
      wrappedAddress: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
      wrappedSymbol: "WPOL",
      wrappedVerified: true,
    },
    rpcUrls: ["https://polygon-amoy-bor-rpc.publicnode.com", "https://rpc-amoy.polygon.technology"],
    explorerUrl: "https://amoy.polygonscan.com",
    cctpDomain: 7,
    finality: { kind: "probabilistic", confirmations: 8 },
    source: SOURCES.polygonRpc,
    color: "#8247E5",
  },
  {
    id: CHAIN_IDS.UNICHAIN_SEPOLIA,
    key: "unichain-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://unichain-sepolia.blockscout.com" },
    name: "Unichain Sepolia",
    shortName: "Unichain",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "Unichain Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x4200000000000000000000000000000000000006",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://sepolia.unichain.org"],
    explorerUrl: "https://sepolia.uniscan.xyz",
    cctpDomain: 10,
    finality: { kind: "rollup", confirmations: 1 },
    color: "#F50DB4",
  },
  {
    id: CHAIN_IDS.WORLD_CHAIN_SEPOLIA,
    key: "world-chain-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://worldchain-sepolia.explorer.alchemy.com" },
    name: "World Chain Sepolia",
    shortName: "World",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "World Chain Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x4200000000000000000000000000000000000006",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://worldchain-sepolia.g.alchemy.com/public", "https://worldchain-sepolia.drpc.org"],
    explorerUrl: "https://worldchain-sepolia.explorer.alchemy.com",
    cctpDomain: 14,
    finality: { kind: "rollup", confirmations: 1 },
    color: "#000000",
  },
  {
    id: CHAIN_IDS.GIWA_SEPOLIA,
    key: "giwa-sepolia",
    tokenIndexer: { kind: "blockscout", baseUrl: "https://sepolia-explorer.giwa.io" },
    name: "GIWA Sepolia",
    shortName: "GIWA",
    tier: 1,
    nativeAsset: {
      canonicalAssetId: "ETH",
      symbol: "ETH",
      name: "GIWA Sepolia Ether",
      decimals: 18,
      wrappedAddress: "0x4200000000000000000000000000000000000006",
      wrappedSymbol: "WETH",
      wrappedVerified: true,
    },
    rpcUrls: ["https://sepolia-rpc.giwa.io"],
    explorerUrl: "https://sepolia-explorer.giwa.io",
    finality: { kind: "rollup", confirmations: 1 },
    source: SOURCES.giwaDocs,
    color: "#1F6FEB",
  },
];

export const CHAINS: ChainConfig[] = seeds.map((seed) => {
  const op = OP_STANDARD_BRIDGES.find((b) => b.l2ChainId === seed.id);
  return {
    ...seed,
    testnet: true,
    vm: "EVM",
    source: seed.source ?? src,
    faucets: faucetsForChain(seed.id),
    opStack: op
      ? { l1ChainId: op.l1ChainId, l1StandardBridge: op.l1StandardBridge, l2StandardBridge: op.l2StandardBridge }
      : undefined,
  };
});

export const CHAIN_BY_ID: ReadonlyMap<number, ChainConfig> = new Map(CHAINS.map((c) => [c.id, c]));

export function getChain(chainId: number): ChainConfig {
  const c = CHAIN_BY_ID.get(chainId);
  if (!c) throw new Error(`Unknown chain ${chainId}`);
  return c;
}

export function findChain(chainId: number): ChainConfig | undefined {
  return CHAIN_BY_ID.get(chainId);
}

export function chainByKey(key: string): ChainConfig | undefined {
  return CHAINS.find((c) => c.key === key);
}
