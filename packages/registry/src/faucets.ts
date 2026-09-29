import type { FaucetRef } from "@testnet-router/core";
import { CHAIN_IDS } from "./chain-ids";
import { REGISTRY_VERIFIED_AT } from "./sources";

const C = CHAIN_IDS;
const at = REGISTRY_VERIFIED_AT;
/** Faucet pages and their stated requirements were re-read on this date. */
const checked = "2026-09-30T00:00:00Z";

const SUPERCHAIN_IDS = [C.OP_SEPOLIA, C.BASE_SEPOLIA, C.UNICHAIN_SEPOLIA, C.WORLD_CHAIN_SEPOLIA, C.INK_SEPOLIA];
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
  C.LINEA_SEPOLIA,
  C.INK_SEPOLIA,
  C.SONIC_TESTNET,
  C.PLUME_TESTNET,
  C.SEI_TESTNET,
  C.CRONOS_TESTNET,
  C.PLASMA_TESTNET,
  C.XLAYER_TESTNET,
  C.INJECTIVE_TESTNET,
];
/** Our testnets in the network list of faucets.chain.link. */
const CHAINLINK_IDS = [
  C.ETHEREUM_SEPOLIA,
  C.ARBITRUM_SEPOLIA,
  C.BASE_SEPOLIA,
  C.OP_SEPOLIA,
  C.ARC_TESTNET,
  C.AVALANCHE_FUJI,
  C.POLYGON_AMOY,
  C.LINEA_SEPOLIA,
  C.MONAD_TESTNET,
  C.UNICHAIN_SEPOLIA,
  C.WORLD_CHAIN_SEPOLIA,
  C.PLUME_TESTNET,
  C.SEI_TESTNET,
  C.CRONOS_TESTNET,
  C.PLASMA_TESTNET,
  C.XLAYER_TESTNET,
];

/** Our testnets on gas.zip/faucets (free claim, gated by mainnet activity). */
const GASZIP_FAUCET_IDS = [C.ETHEREUM_SEPOLIA, C.ARBITRUM_SEPOLIA, C.BASE_SEPOLIA, C.OP_SEPOLIA, C.POLYGON_AMOY, C.AVALANCHE_FUJI, C.SEI_TESTNET];
/** Our testnets where Gas.zip's refuel held gas (backend.gas.zip/v2/chains `bal` > 0); Monad and Plasma were empty. */
const GASZIP_REFUEL_IDS = [
  C.ETHEREUM_SEPOLIA,
  C.BASE_SEPOLIA,
  C.OP_SEPOLIA,
  C.ARBITRUM_SEPOLIA,
  C.UNICHAIN_SEPOLIA,
  C.WORLD_CHAIN_SEPOLIA,
  C.INK_SEPOLIA,
  C.GIWA_SEPOLIA,
  C.POLYGON_AMOY,
  C.AVALANCHE_FUJI,
  C.SEI_TESTNET,
];

/**
 * Faucets are external dependencies, not APIs. Never auto-claim; always open
 * externally. `chainId: 0` marks multi-chain faucets / directories.
 * `requires` and `drip` carry only what the faucet's own page or docs state.
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
    requires: ["CAPTCHA"],
    drip: "20 USDC per 2 h, per address and chain",
    notes: "Circle test USDC on supported testnets, no account. On Arc Testnet USDC is also the gas asset.",
    lastVerifiedAt: checked,
    health: "VERIFIED_RECENTLY",
  },
  {
    id: "chainlink-faucets",
    chainId: 0,
    chainIds: CHAINLINK_IDS,
    assetId: "*",
    name: "Chainlink Faucets",
    url: "https://faucets.chain.link/",
    source: "THIRD_PARTY",
    requires: ["WALLET"],
    notes: "25 LINK on every listed testnet and native gas on some (0.5 ETH on Sepolia, Arbitrum, Base and Linea; 0.5 AVAX on Fuji). Checks made at claim time are not shown before you connect.",
    lastVerifiedAt: checked,
  },
  {
    id: "gaszip-faucets",
    chainId: 0,
    chainIds: GASZIP_FAUCET_IDS,
    assetId: "*",
    name: "Gas.zip Faucets",
    url: "https://www.gas.zip/faucets",
    source: "THIRD_PARTY",
    requires: ["MAINNET_BALANCE", "WALLET"],
    drip: "once per 12 h",
    notes: "Free native gas for addresses with mainnet activity (0.01 ETH and 5+ transactions in 30 days); more Gas.zip use, larger claims.",
    lastVerifiedAt: checked,
  },
  {
    id: "gaszip-refuel",
    chainId: 0,
    chainIds: GASZIP_REFUEL_IDS,
    assetId: "*",
    name: "Gas.zip Refuel",
    url: "https://www.gas.zip/",
    source: "THIRD_PARTY",
    requires: ["PAID", "WALLET"],
    notes: "Not free: you pay a small amount on a mainnet and receive native testnet gas on the chains you pick. Handy where free faucets are scarce (GIWA, Sei). Listed only where Gas.zip held gas at the last check.",
    lastVerifiedAt: checked,
  },
  // Ethereum Sepolia ETH
  {
    id: "ethereum-org-directory",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "ethereum.org faucet directory",
    url: "https://ethereum.org/developers/docs/networks/",
    source: "CHAIN_OFFICIAL",
    directory: true,
    notes: "Directory of Sepolia faucets maintained by ethereum.org",
    lastVerifiedAt: at,
  },
  {
    id: "pk910-sepolia-pow",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "Sepolia PoW Faucet",
    url: "https://sepolia-faucet.pk910.de/",
    source: "THIRD_PARTY",
    requires: ["PROOF_OF_WORK", "CAPTCHA"],
    drip: "0.05 to 2.5 ETH per mining session",
    notes: "Mine in the browser for a while, then claim. No account and no mainnet funds, so it works for a brand-new wallet.",
    lastVerifiedAt: checked,
    health: "VERIFIED_RECENTLY",
  },
  {
    id: "alchemy-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "Alchemy Sepolia Faucet",
    url: "https://www.alchemy.com/faucets/ethereum-sepolia",
    source: "THIRD_PARTY",
    requires: ["MAINNET_BALANCE"],
    drip: "0.1 ETH per 24 h",
    notes: "No Alchemy account, but the address needs at least 0.001 ETH and some activity on Ethereum mainnet.",
    lastVerifiedAt: checked,
  },
  {
    id: "google-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "Google Cloud Web3 Faucet",
    url: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
    source: "THIRD_PARTY",
    requires: ["ACCOUNT"],
    lastVerifiedAt: at,
  },
  {
    id: "quicknode-sepolia",
    chainId: C.ETHEREUM_SEPOLIA,
    assetId: "ETH",
    name: "QuickNode Sepolia Faucet",
    url: "https://faucet.quicknode.com/ethereum/sepolia",
    source: "THIRD_PARTY",
    requires: ["WALLET", "CAPTCHA"],
    drip: "once per 12 h per network",
    notes: "No account and no mainnet balance. Posting on X doubles the drip.",
    lastVerifiedAt: checked,
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
    requires: ["ACCOUNT"],
    drip: "0.1 ETH per 24 h on one network",
    notes: "OP Sepolia, Base Sepolia, Unichain Sepolia, World Chain Sepolia, Ink, Zora, Mode, Lisk and other Superchain testnets. Verifying an onchain identity raises the amount.",
    lastVerifiedAt: checked,
    health: "VERIFIED_RECENTLY",
  },
  {
    id: "base-get-funds",
    chainId: C.BASE_SEPOLIA,
    assetId: "ETH",
    name: "Base: get testnet funds",
    url: "https://docs.base.org/get-started/get-funds",
    source: "CHAIN_OFFICIAL",
    directory: true,
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
    requires: ["MAINNET_BALANCE"],
    drip: "0.1 ETH per 24 h",
    notes: "No Alchemy account, but the address needs at least 0.001 ETH and some activity on Ethereum mainnet.",
    lastVerifiedAt: checked,
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
    requires: ["ACCOUNT"],
    lastVerifiedAt: at,
    health: "VERIFIED_RECENTLY",
  },
  // Polygon Amoy: Polygon retired its own faucet and lists third-party ones.
  {
    id: "polygon-faucet-directory",
    chainId: C.POLYGON_AMOY,
    assetId: "POL",
    name: "Polygon: test token faucets",
    url: "https://docs.polygon.technology/tools/gas/matic-faucet/",
    source: "CHAIN_OFFICIAL",
    directory: true,
    notes: "Polygon's own faucet is no longer available; its docs list these third-party faucets instead.",
    lastVerifiedAt: checked,
  },
  {
    id: "alchemy-polygon-amoy",
    chainId: C.POLYGON_AMOY,
    assetId: "POL",
    name: "Alchemy Amoy Faucet",
    url: "https://www.alchemy.com/faucets/polygon-amoy",
    source: "THIRD_PARTY",
    requires: ["MAINNET_BALANCE"],
    drip: "0.1 POL per 24 h",
    notes: "No Alchemy account, but the address needs at least 0.001 ETH and some activity on Ethereum mainnet.",
    lastVerifiedAt: checked,
  },
  {
    id: "quicknode-polygon-amoy",
    chainId: C.POLYGON_AMOY,
    assetId: "POL",
    name: "QuickNode Amoy Faucet",
    url: "https://faucet.quicknode.com/polygon/amoy",
    source: "THIRD_PARTY",
    requires: ["WALLET", "CAPTCHA"],
    drip: "once per 12 h per network",
    notes: "No account and no mainnet balance. Posting on X doubles the drip.",
    lastVerifiedAt: checked,
  },
  {
    id: "getblock-polygon-amoy",
    chainId: C.POLYGON_AMOY,
    assetId: "POL",
    name: "GetBlock Amoy Faucet",
    url: "https://getblock.io/faucet/matic-amoy/",
    source: "THIRD_PARTY",
    requires: ["ACCOUNT", "MAINNET_BALANCE"],
    drip: "0.1 POL per day",
    notes: "Needs a GetBlock account and at least 0.005 ETH on Ethereum mainnet.",
    lastVerifiedAt: checked,
  },
  // World Chain Sepolia
  {
    id: "alchemy-world-chain-sepolia",
    chainId: C.WORLD_CHAIN_SEPOLIA,
    assetId: "ETH",
    name: "Alchemy World Chain Sepolia Faucet",
    url: "https://www.alchemy.com/faucets/world-chain-sepolia",
    source: "THIRD_PARTY",
    requires: ["MAINNET_BALANCE"],
    drip: "0.1 ETH per 24 h",
    notes: "No Alchemy account, but the address needs at least 0.001 ETH and some activity on Ethereum mainnet.",
    lastVerifiedAt: checked,
  },
  // GIWA Sepolia
  {
    id: "giwa-faucet",
    chainId: C.GIWA_SEPOLIA,
    assetId: "ETH",
    name: "Official GIWA Faucet",
    url: "https://faucet.giwa.io/",
    source: "CHAIN_OFFICIAL",
    drip: "up to 0.005 ETH per 24 h",
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
    requires: ["SOCIAL", "CAPTCHA"],
    drip: "0.01 ETH per 24 h",
    notes: "Follow @NoditPlatform on X; no account. Listed in the GIWA docs.",
    lastVerifiedAt: checked,
  },
  // Linea Sepolia
  {
    id: "linea-faucet-directory",
    chainId: C.LINEA_SEPOLIA,
    assetId: "ETH",
    name: "Linea: get testnet ETH",
    url: "https://docs.linea.build/get-started/how-to/get-testnet-eth",
    source: "CHAIN_OFFICIAL",
    directory: true,
    notes: "Official Linea list of Linea Sepolia faucets",
    lastVerifiedAt: at,
  },
  // Ink Sepolia
  {
    id: "ink-faucet",
    chainId: C.INK_SEPOLIA,
    assetId: "ETH",
    name: "Ink Faucet",
    url: "https://inkonchain.com/faucet",
    source: "CHAIN_OFFICIAL",
    lastVerifiedAt: at,
  },
  // Sonic Testnet
  {
    id: "sonic-faucet",
    chainId: C.SONIC_TESTNET,
    assetId: "S",
    name: "Sonic Testnet Faucet",
    url: "https://testnet.soniclabs.com/account",
    source: "CHAIN_OFFICIAL",
    lastVerifiedAt: at,
  },
  // Plume Testnet
  {
    id: "plume-faucet",
    chainId: C.PLUME_TESTNET,
    assetId: "PLUME",
    name: "Plume Faucet",
    url: "https://faucet.plume.org",
    source: "CHAIN_OFFICIAL",
    lastVerifiedAt: at,
  },
  // Sei Testnet: the old atlantic-2 app host no longer resolves; the faucet now lives in the docs.
  {
    id: "sei-faucet",
    chainId: C.SEI_TESTNET,
    assetId: "SEI",
    name: "Sei Testnet Faucet",
    url: "https://docs.sei.io/learn/faucet",
    source: "CHAIN_OFFICIAL",
    requires: ["CAPTCHA"],
    drip: "once per 24 h per address",
    lastVerifiedAt: checked,
  },
  // Cronos Testnet: cronos.org/faucet now ends in a 404; the docs point here.
  {
    id: "cronos-faucet",
    chainId: C.CRONOS_TESTNET,
    assetId: "CRO",
    name: "Cronos Testnet Faucet",
    url: "https://faucet.cronos.com/",
    source: "CHAIN_OFFICIAL",
    notes: "Daily limit; Cronos' docs send larger requests to #request-tcro-cronos on their Discord.",
    lastVerifiedAt: checked,
  },
  // X Layer Testnet
  {
    id: "xlayer-faucet",
    chainId: C.XLAYER_TESTNET,
    assetId: "OKB",
    name: "X Layer Faucet",
    url: "https://web3.okx.com/xlayer/faucet",
    source: "CHAIN_OFFICIAL",
    requires: ["ACCOUNT"],
    lastVerifiedAt: checked,
  },
  // Injective Testnet
  {
    id: "injective-faucet",
    chainId: C.INJECTIVE_TESTNET,
    assetId: "INJ",
    name: "Injective Testnet Faucet",
    url: "https://testnet.faucet.injective.network",
    source: "CHAIN_OFFICIAL",
    notes: "Requests are queued and paid out every 5 to 10 minutes.",
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
    directory: true,
    notes: "Directory of faucets across many testnets; fallback source",
    lastVerifiedAt: at,
  },
];

/**
 * Lower is easier. Tiers: free with no mainnet funds, free with mainnet funds,
 * paid, list of faucets. Within a tier the chain's own before a multi-chain
 * one, and no login before a login.
 */
function effort(f: FaucetRef): number {
  const tier = f.directory ? 3 : f.requires?.includes("PAID") ? 2 : f.requires?.includes("MAINNET_BALANCE") ? 1 : 0;
  return tier * 10 + (f.chainId === 0 ? 2 : 0) + (f.requires?.includes("ACCOUNT") ? 1 : 0);
}

/** Every faucet for a chain, easiest first (gas hints show the first one or two). */
export function faucetsForChain(chainId: number): FaucetRef[] {
  return FAUCETS.filter((f) => f.chainId === chainId || f.chainIds?.includes(chainId)).sort((a, b) => effort(a) - effort(b));
}

export function faucetById(id: string): FaucetRef | undefined {
  return FAUCETS.find((f) => f.id === id);
}
