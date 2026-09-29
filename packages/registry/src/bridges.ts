import type { Address, SourceProvenance } from "@testnet-router/core";
import { CHAIN_IDS } from "./chain-ids";
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
  {
    l2ChainId: CHAIN_IDS.UNICHAIN_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0xea58fcA6849d79EAd1f26608855c2D6407d54Ce2",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.unichainRegistry,
  },
  {
    l2ChainId: CHAIN_IDS.WORLD_CHAIN_SEPOLIA,
    l1ChainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    l1StandardBridge: "0xd7DF54b3989855eb66497301a4aAEc33Dbb3F8DE",
    l2StandardBridge: "0x4200000000000000000000000000000000000010",
    source: SOURCES.worldchainDocs,
  },
];

export function opBridgeForL2(l2ChainId: number): OpStandardBridgeDeployment | undefined {
  return OP_STANDARD_BRIDGES.find((b) => b.l2ChainId === l2ChainId);
}

export interface ChainExit {
  chainId: number;
  /** Where the withdrawal has to be done, since RouteDust does not execute it. */
  name: string;
  url: string;
  /** What the user is in for, in their own words. */
  note: string;
  source: SourceProvenance;
}

/**
 * Chains with no live route out (no CCTP, no third-party bridge, no DEX): the
 * only exit is the rollup's own withdrawal, which needs a proof and a challenge
 * period, so it is a link, not an edge.
 */
export const CHAIN_EXITS: ChainExit[] = [
  {
    chainId: CHAIN_IDS.GIWA_SEPOLIA,
    name: "GIWA Sepolia bridge",
    url: "https://sepolia-bridge.giwa.io/?fromChainId=91342&toChainId=11155111",
    note: "Withdrawing to Ethereum Sepolia is a three-step rollup withdrawal: start it on GIWA, prove it on Sepolia once a dispute game exists (up to about two hours), then finalise it after the challenge period of about seven days. Activity can start it and sign both Sepolia steps when they are due; GIWA's own bridge does the same.",
    source: SOURCES.giwaDocs,
  },
];

export function chainExit(chainId: number): ChainExit | undefined {
  return CHAIN_EXITS.find((e) => e.chainId === chainId);
}

export interface OfficialBridge {
  id: string;
  /** The chain whose team runs this bridge, or recommends it in its own docs. */
  chainId: number;
  name: string;
  url: string;
  /** Chains it moves funds to and from, besides `chainId` (usually the settlement layer). */
  counterparts: number[];
  /**
   * Link that preselects the direction: `{from}` / `{to}` become `slugs[id]`
   * or the chain id. Only formats seen in the bridge's own links or docs.
   */
  deepLink?: string;
  slugs?: Record<number, string>;
  /** What it moves and how long each direction takes, in the user's words. */
  note: string;
  /** Run by the chain's own team (true) or a third party its docs send users to. */
  firstParty: boolean;
  source: SourceProvenance;
}

const SEPOLIA = CHAIN_IDS.ETHEREUM_SEPOLIA;

/** Superbridge's testnet site: the canonical OP Stack bridge, direction preselected by chain id. */
function superbridge(chainId: number, label: string, note: string, source: SourceProvenance): OfficialBridge {
  return {
    id: `superbridge-${chainId}`,
    chainId,
    name: `Superbridge (${label})`,
    url: `https://testnets.superbridge.app/?fromChainId=${SEPOLIA}&toChainId=${chainId}`,
    counterparts: [SEPOLIA],
    deepLink: "https://testnets.superbridge.app/?fromChainId={from}&toChainId={to}",
    note,
    firstParty: false,
    source,
  };
}

const ARBITRUM_SLUGS: Record<number, string> = {
  [SEPOLIA]: "sepolia",
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: "arbitrum-sepolia",
  [CHAIN_IDS.PLUME_TESTNET]: "plume-testnet",
};

/**
 * Bridge UIs for moving funds on and off a testnet outside RouteDust: shown
 * next to routes, and instead of them where no live route exists. A link, not
 * an edge: nothing here is quoted or executed. Chains without a working
 * testnet bridge UI (Arc, Monad, Fuji, Sonic, Sei, Cronos, Plasma, X Layer at
 * 2026-09-29) are left out rather than guessed.
 */
export const OFFICIAL_BRIDGES: OfficialBridge[] = [
  superbridge(
    CHAIN_IDS.BASE_SEPOLIA,
    "Base Sepolia",
    "ETH both ways between Ethereum Sepolia and Base Sepolia over Base's canonical bridge; Base's docs list only third-party bridge sites. Deposits take a few minutes; a withdrawal is proved on Sepolia and finalised after the challenge period (five days since Base's Beryl upgrade, seven before).",
    SOURCES.baseBridges,
  ),
  superbridge(
    CHAIN_IDS.OP_SEPOLIA,
    "OP Sepolia",
    "ETH both ways between Ethereum Sepolia and OP Sepolia over the canonical bridge; Optimism retired its own bridge page. A withdrawal is proved and then finalised; Optimism's docs say the wait is shorter on test networks than mainnet's seven days.",
    SOURCES.optimismWithdrawals,
  ),
  {
    id: "arbitrum-bridge",
    chainId: CHAIN_IDS.ARBITRUM_SEPOLIA,
    name: "Arbitrum bridge",
    url: "https://portal.arbitrum.io/bridge?sourceChain=sepolia&destinationChain=arbitrum-sepolia",
    counterparts: [SEPOLIA],
    deepLink: "https://portal.arbitrum.io/bridge?sourceChain={from}&destinationChain={to}",
    slugs: ARBITRUM_SLUGS,
    note: "ETH and tokens both ways between Ethereum Sepolia and Arbitrum Sepolia; the testnets show up once your wallet is on Sepolia. A withdrawal is claimed on Sepolia, usually within an hour on this testnet.",
    firstParty: true,
    source: SOURCES.arbitrumBridge,
  },
  superbridge(
    CHAIN_IDS.UNICHAIN_SEPOLIA,
    "Unichain Sepolia",
    "ETH both ways between Ethereum Sepolia and Unichain Sepolia over the canonical bridge, as listed in Unichain's docs. A withdrawal is proved on Sepolia and finalised after the OP Stack challenge period.",
    SOURCES.unichainBridges,
  ),
  {
    id: "worldchain-alchemy-bridge",
    chainId: CHAIN_IDS.WORLD_CHAIN_SEPOLIA,
    name: "World Chain Sepolia bridge",
    url: "https://worldchain-sepolia.bridge.alchemy.com/",
    counterparts: [SEPOLIA],
    note: "Deposit and withdraw between Ethereum Sepolia and World Chain Sepolia, run by Alchemy for World Chain. The page says deposits land within seconds and withdrawals can take up to 13 days.",
    firstParty: true,
    source: SOURCES.worldchainBridges,
  },
  {
    id: "giwa-bridge",
    chainId: CHAIN_IDS.GIWA_SEPOLIA,
    name: "GIWA Sepolia bridge",
    url: "https://sepolia-bridge.giwa.io/",
    counterparts: [SEPOLIA],
    deepLink: "https://sepolia-bridge.giwa.io/?fromChainId={from}&toChainId={to}",
    note: "ETH both ways between Ethereum Sepolia and GIWA. Deposits arrive in a few minutes; withdrawals are proved after about two hours and finalised after a challenge period of about seven days.",
    firstParty: true,
    source: SOURCES.giwaBridges,
  },
  {
    id: "linea-native-bridge",
    chainId: CHAIN_IDS.LINEA_SEPOLIA,
    name: "Linea native bridge",
    url: "https://linea.build/bridge/native-bridge",
    counterparts: [SEPOLIA],
    note: "The only bridge Linea supports on testnet: turn on Show Test Networks in its settings. ETH takes about 20 minutes into Linea; the way back takes 2 to 12 hours and a claim on Sepolia.",
    firstParty: true,
    source: SOURCES.lineaBridge,
  },
  superbridge(
    CHAIN_IDS.INK_SEPOLIA,
    "Ink Sepolia",
    "ETH both ways between Ethereum Sepolia and Ink Sepolia over the canonical bridge, as listed in Ink's docs (Ink's own bridge page now serves mainnet only). A withdrawal is proved on Sepolia and finalised after the OP Stack challenge period.",
    SOURCES.inkBridges,
  ),
  {
    id: "polygon-portal",
    chainId: CHAIN_IDS.POLYGON_AMOY,
    name: "Polygon Portal",
    url: "https://portal.polygon.technology/bridge",
    counterparts: [SEPOLIA],
    note: "POL and the Portal's listed tokens between Ethereum Sepolia and Amoy; switch the Portal to testnet first. The Portal's own estimate is about 22 minutes into Amoy and about 90 minutes back.",
    firstParty: true,
    source: SOURCES.polygonPortal,
  },
  {
    id: "plume-arbitrum-bridge",
    chainId: CHAIN_IDS.PLUME_TESTNET,
    name: "Arbitrum bridge (Plume Testnet)",
    url: "https://portal.arbitrum.io/bridge?sourceChain=sepolia&destinationChain=plume-testnet",
    counterparts: [SEPOLIA],
    deepLink: "https://portal.arbitrum.io/bridge?sourceChain={from}&destinationChain={to}",
    slugs: ARBITRUM_SLUGS,
    note: "Plume Testnet settles on Ethereum Sepolia through Arbitrum's stack; Plume's docs send testnet users to Arbitrum's bridge for the move between the two. Plume does not document how long a withdrawal takes.",
    firstParty: false,
    source: SOURCES.plumeBridges,
  },
  {
    id: "injective-bridge",
    chainId: CHAIN_IDS.INJECTIVE_TESTNET,
    name: "Injective Bridge (testnet)",
    url: "https://testnet.bridge.injective.network/",
    counterparts: [SEPOLIA],
    note: "Injective's own bridge from Ethereum Sepolia onto the Injective testnet (injective-888, the chain behind this EVM network), linked from Injective's testnet Hub. Timing is not documented.",
    firstParty: true,
    source: SOURCES.injectiveHub,
  },
];

export function officialBridgeUrl(bridge: OfficialBridge, from?: number, to?: number): string {
  if (!bridge.deepLink || from === undefined || to === undefined) return bridge.url;
  const slug = (id: number) => bridge.slugs?.[id] ?? String(id);
  return bridge.deepLink.replace("{from}", slug(from)).replace("{to}", slug(to));
}

/** Bridges that connect these two chains, in either direction. */
export function officialBridgesBetween(a: number, b: number): OfficialBridge[] {
  return OFFICIAL_BRIDGES.filter((x) => (x.chainId === a && x.counterparts.includes(b)) || (x.chainId === b && x.counterparts.includes(a)));
}

/** The bridges a chain's own docs point to. */
export function officialBridgesFor(chainId: number): OfficialBridge[] {
  return OFFICIAL_BRIDGES.filter((x) => x.chainId === chainId);
}

/** Across testnet environment. The authoritative list comes from /available-routes at runtime. */
export const ACROSS_TESTNET = {
  apiBase: "https://testnet.across.to/api",
  /**
   * The only contracts a deposit may be sent to (and a token approved for):
   * the API's spokePoolAddress must match, never be taken on trust.
   */
  spokePools: {
    [CHAIN_IDS.ETHEREUM_SEPOLIA]: "0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662",
    [CHAIN_IDS.BASE_SEPOLIA]: "0x82B564983aE7274c86695917BBf8C99ECb6F0F8F",
    [CHAIN_IDS.OP_SEPOLIA]: "0x4e8E101924eDE233C13e2D8622DC8aED2872d505",
    [CHAIN_IDS.ARBITRUM_SEPOLIA]: "0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75",
    [CHAIN_IDS.UNICHAIN_SEPOLIA]: "0x6999526e507Cc3b03b180BbE05E1Ff938259A874",
    [CHAIN_IDS.POLYGON_AMOY]: "0xd08baaE74D6d2eAb1F3320B2E1a53eeb391ce8e5",
  } as Record<number, Address>,
  spokePoolSource: SOURCES.acrossContracts,
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
