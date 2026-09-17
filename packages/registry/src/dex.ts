import type { Address, SourceProvenance } from "@testnet-router/core";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export interface UniswapV3Deployment {
  chainId: number;
  factory: Address;
  quoterV2: Address;
  swapRouter02: Address;
  universalRouter: Address;
  permit2: Address;
  weth9: Address;
  /** Fee tiers to probe for pools. */
  feeTiers: number[];
  source: SourceProvenance;
}

/**
 * Deployment existing != liquidity existing. Every SWAP edge is created only
 * after a live pool + quote check (spec section 6.1).
 */
export const UNISWAP_V3_DEPLOYMENTS: UniswapV3Deployment[] = [
  {
    chainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    universalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    weth9: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    feeTiers: [500, 3000, 10000],
    source: SOURCES.uniswapSepolia,
  },
  {
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    quoterV2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    swapRouter02: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
    universalRouter: "0x492E6456D9528771018DeB9E87ef7750EF184104",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    weth9: "0x4200000000000000000000000000000000000006",
    feeTiers: [500, 3000, 10000],
    source: SOURCES.uniswapBase,
  },
];

export function uniswapDeploymentFor(chainId: number): UniswapV3Deployment | undefined {
  return UNISWAP_V3_DEPLOYMENTS.find((d) => d.chainId === chainId);
}

export interface V2AmmDeployment {
  /** Short key used in edge ids (e.g. "pangolin"). */
  key: string;
  name: string;
  chainId: number;
  factory: Address;
  router: Address;
  /** Wrapped native the router uses (router.WETH()/WAVAX() verified on-chain). */
  wrappedNative: Address;
  /** Pair fee in bps (Uniswap v2 style pools charge 30). */
  feeBps: number;
  source: SourceProvenance;
}

/**
 * Uniswap v2 compatible AMMs on testnets without a Uniswap deployment.
 * Deployment existing != liquidity existing: the adapter only creates edges
 * for pairs with reserves on both sides and a working getAmountsOut.
 */
export const V2_AMM_DEPLOYMENTS: V2AmmDeployment[] = [
  {
    key: "pangolin",
    name: "Pangolin",
    chainId: CHAIN_IDS.AVALANCHE_FUJI,
    factory: "0xE4A575550C2b460d2307b82dCd7aFe84AD1484dd",
    router: "0x2D99ABD9008Dc933ff5c0CD271B88309593aB921",
    wrappedNative: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
    feeBps: 30,
    source: SOURCES.pangolinDocs,
  },
  {
    key: "pangolin-app",
    name: "Pangolin (app deployment)",
    chainId: CHAIN_IDS.AVALANCHE_FUJI,
    factory: "0x2a496ec9e9bE22e66C61d4Eb9d316beaEE31A77b",
    router: "0x688d21b0B8Dc35971AF58cFF1F7Bf65639937860",
    wrappedNative: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
    feeBps: 30,
    source: SOURCES.pangolinSdk,
  },
  {
    key: "lfj",
    name: "LFJ v1",
    chainId: CHAIN_IDS.AVALANCHE_FUJI,
    factory: "0xF5c7d9733e5f53abCC1695820c4818C59B457C2C",
    router: "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901",
    wrappedNative: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
    feeBps: 30,
    source: SOURCES.lfjDocs,
  },
];
