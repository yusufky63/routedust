import type { Address, Asset, AssetNode, ChainConfig } from "@testnet-router/core";
import { CHAINS } from "./chains";
import { CHAIN_IDS } from "./faucets";
import { SOURCES } from "./sources";

export function assetId(chainId: number, address?: Address): string {
  return address ? `${chainId}:${address.toLowerCase()}` : `${chainId}:native`;
}

/**
 * Circle-issued test USDC (ERC-20). Arc is intentionally absent here: on Arc
 * USDC is the native gas asset and is registered as the NATIVE asset instead.
 * symbol()/decimals() were verified on-chain for every entry.
 */
export const CIRCLE_USDC: Record<number, Address> = {
  [CHAIN_IDS.ETHEREUM_SEPOLIA]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [CHAIN_IDS.BASE_SEPOLIA]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [CHAIN_IDS.OP_SEPOLIA]: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [CHAIN_IDS.MONAD_TESTNET]: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  [CHAIN_IDS.AVALANCHE_FUJI]: "0x5425890298aed601595a70AB815c96711a31Bc65",
  [CHAIN_IDS.POLYGON_AMOY]: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  [CHAIN_IDS.UNICHAIN_SEPOLIA]: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  [CHAIN_IDS.WORLD_CHAIN_SEPOLIA]: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  [CHAIN_IDS.LINEA_SEPOLIA]: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
  [CHAIN_IDS.INK_SEPOLIA]: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac",
  [CHAIN_IDS.SONIC_TESTNET]: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
  [CHAIN_IDS.PLUME_TESTNET]: "0xcB5f30e335672893c7eb944B374c196392C19D18",
  [CHAIN_IDS.SEI_TESTNET]: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
  [CHAIN_IDS.CRONOS_TESTNET]: "0xEb33dc5fac03833e132593659e1dE7256aB59794",
  [CHAIN_IDS.PLASMA_TESTNET]: "0xE67Fb267022cBA8064Dd388CC2FED724F3120D9D",
  [CHAIN_IDS.XLAYER_TESTNET]: "0xDec90b78111Ba2fc6FC6d84d8B9ec159A2d4b9B3",
  [CHAIN_IDS.INJECTIVE_TESTNET]: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
};

function nativeAssetOf(chain: ChainConfig): Asset {
  const n = chain.nativeAsset;
  return {
    id: assetId(chain.id),
    chainId: chain.id,
    canonicalAssetId: n.canonicalAssetId,
    kind: "NATIVE",
    decimals: n.decimals,
    symbol: n.symbol,
    name: n.name,
    representation: "NATIVE",
    issuer: n.canonicalAssetId === "USDC" ? "Circle" : undefined,
    verified: true,
    source: chain.source,
  };
}

function wrappedNativeOf(chain: ChainConfig): Asset | undefined {
  const n = chain.nativeAsset;
  if (!n.wrappedAddress || !n.wrappedVerified) return undefined;
  return {
    id: assetId(chain.id, n.wrappedAddress),
    chainId: chain.id,
    canonicalAssetId: `W${n.canonicalAssetId}`,
    kind: "WRAPPED_NATIVE",
    address: n.wrappedAddress,
    decimals: n.decimals,
    symbol: n.wrappedSymbol ?? `W${n.symbol}`,
    name: `Wrapped ${n.name}`,
    representation: "WRAPPED_NATIVE",
    verified: true,
    source: SOURCES.wrappedNativeProbe,
  };
}

function usdcOf(chain: ChainConfig): Asset | undefined {
  const address = CIRCLE_USDC[chain.id];
  if (!address) return undefined;
  return {
    id: assetId(chain.id, address),
    chainId: chain.id,
    canonicalAssetId: "USDC",
    kind: "ERC20",
    address,
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin (Circle test)",
    representation: "CIRCLE_NATIVE",
    issuer: "Circle",
    verified: true,
    source: SOURCES.circleUsdcAddresses,
  };
}

export const ASSETS: Asset[] = CHAINS.flatMap((chain) => {
  const list: Asset[] = [nativeAssetOf(chain)];
  const wrapped = wrappedNativeOf(chain);
  if (wrapped) list.push(wrapped);
  const usdc = usdcOf(chain);
  if (usdc) list.push(usdc);
  return list;
});

export const ASSET_BY_ID: ReadonlyMap<string, Asset> = new Map(ASSETS.map((a) => [a.id, a]));

export function findAsset(id: string): Asset | undefined {
  return ASSET_BY_ID.get(id);
}

export function assetsForChain(chainId: number): Asset[] {
  return ASSETS.filter((a) => a.chainId === chainId);
}

export function nativeAsset(chainId: number): Asset {
  const a = ASSETS.find((x) => x.chainId === chainId && x.kind === "NATIVE");
  if (!a) throw new Error(`No native asset for chain ${chainId}`);
  return a;
}

export function wrappedNative(chainId: number): Asset | undefined {
  return ASSETS.find((x) => x.chainId === chainId && x.kind === "WRAPPED_NATIVE");
}

/**
 * The Circle-native USDC representation on a chain: the ERC-20 Circle token,
 * or on Arc the native gas asset itself.
 */
export function usdcAsset(chainId: number): Asset | undefined {
  return ASSETS.find(
    (x) =>
      x.chainId === chainId &&
      x.canonicalAssetId === "USDC" &&
      (x.representation === "CIRCLE_NATIVE" || x.representation === "NATIVE"),
  );
}

export function nodeOf(asset: Asset): AssetNode {
  return {
    chainId: asset.chainId,
    canonicalAssetId: asset.canonicalAssetId,
    representation: asset.representation,
    assetId: asset.id,
  };
}

/** Destination presets (spec section 41). */
export interface DestinationPreset {
  id: string;
  label: string;
  description: string;
  node: AssetNode;
}

export const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    id: "base-usdc",
    label: "Consolidate to Base USDC",
    description: "Good general multi-chain target",
    node: nodeOf(usdcAsset(CHAIN_IDS.BASE_SEPOLIA) as Asset),
  },
  {
    id: "sepolia-eth",
    label: "Consolidate to Ethereum Sepolia ETH",
    description: "Useful for L1 / ETH-focused testing",
    node: nodeOf(nativeAsset(CHAIN_IDS.ETHEREUM_SEPOLIA)),
  },
  {
    id: "arc-usdc",
    label: "Consolidate USDC to Arc",
    description: "Arc uses USDC as gas",
    node: nodeOf(nativeAsset(CHAIN_IDS.ARC_TESTNET)),
  },
];
