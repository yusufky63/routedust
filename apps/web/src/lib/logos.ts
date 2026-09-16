/**
 * Official-looking logos from public, stable sources (LI.FI chain icons on
 * GitHub, Trust Wallet / DeBank token images). Testnets reuse their mainnet
 * mark. Missing entries fall back to a typographic monogram.
 */
const LIFI = "https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains";
const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets";

export const CHAIN_LOGOS: Record<number, string> = {
  11155111: `${LIFI}/ethereum.svg`,
  84532: `${LIFI}/base.svg`,
  11155420: `${LIFI}/optimism.svg`,
  421614: `${LIFI}/arbitrum.svg`,
  5042002: `${LIFI}/arc.svg`,
  10143: `${LIFI}/monad.svg`,
  43113: `${LIFI}/avalanche.svg`,
  80002: `${LIFI}/polygon.svg`,
  1301: `${LIFI}/unichain.svg`,
  4801: `${LIFI}/world.svg`,
};

export const ETH_LOGO = `${TW}/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png`;
export const USDC_LOGO = `${TW}/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`;

/** Native gas tokens that are not ETH. */
export const NATIVE_LOGOS: Record<string, string> = {
  POL: "https://static.debank.com/image/matic_token/logo_url/matic/6f5a6b6f0732a7a235131bd7804d357c.png",
  MON: "https://static.debank.com/image/monad_token/logo_url/monad/9df1611d238781f78045fba9101359a3.png",
  AVAX: "https://static.debank.com/image/avax_token/logo_url/avax/0b9c84359c84d6bdd5bfda9c2d4c4a82.png",
};

/** Route every logo through the same-origin proxy (correct content types, no third-party blocking). */
export function logoSrc(url: string): string {
  return `/api/logo?u=${encodeURIComponent(url)}`;
}

export function chainLogo(chainId: number): string | undefined {
  const url = CHAIN_LOGOS[chainId];
  return url ? logoSrc(url) : undefined;
}

export function assetLogo(canonicalAssetId: string): string | undefined {
  let url: string | undefined;
  if (canonicalAssetId === "ETH" || canonicalAssetId === "WETH") url = ETH_LOGO;
  else if (canonicalAssetId === "USDC") url = USDC_LOGO;
  else url = NATIVE_LOGOS[canonicalAssetId.replace(/^W/, "")];
  return url ? logoSrc(url) : undefined;
}
