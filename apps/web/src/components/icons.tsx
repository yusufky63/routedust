"use client";

import type { Asset } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";

/**
 * Small typographic icons (spec section 30: chain colors only in 12-16px
 * marks). No external assets: monograms and two primitive glyphs.
 */

const CHAIN_MONOGRAM: Record<number, string> = {
  11155111: "Ξ",
  84532: "B",
  11155420: "OP",
  421614: "A",
  5042002: "◎",
  10143: "M",
  43113: "▲",
  80002: "P",
  1301: "U",
  4801: "W",
  91342: "G",
};

export function ChainIcon({ chainId, size = 16, className = "" }: { chainId: number; size?: number; className?: string }) {
  const chain = findChain(chainId);
  const color = chain?.color ?? "#90959F";
  const text = CHAIN_MONOGRAM[chainId] ?? (chain?.shortName?.[0] ?? "?");
  const fontSize = text.length > 1 ? size * 0.5 : size * 0.62;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`inline-block shrink-0 ${className}`} aria-label={chain?.name ?? `chain ${chainId}`} role="img">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill={color} stroke="rgba(0,0,0,0.25)" />
      <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fontSize={(fontSize * 16) / size} fontFamily="var(--font-mono)" fontWeight="600" fill="#fff">
        {text}
      </text>
    </svg>
  );
}

function EthGlyph({ size, outlined = false }: { size: number; outlined?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="inline-block shrink-0" role="img" aria-label={outlined ? "WETH" : "ETH"}>
      <polygon points="8,1 13,8.2 8,11.2 3,8.2" fill={outlined ? "none" : "currentColor"} stroke="currentColor" strokeWidth={outlined ? 1.2 : 0} opacity={outlined ? 0.9 : 0.95} />
      <polygon points="8,12.4 13,9.3 8,15 3,9.3" fill={outlined ? "none" : "currentColor"} stroke="currentColor" strokeWidth={outlined ? 1.2 : 0} opacity={outlined ? 0.9 : 0.6} />
    </svg>
  );
}

function CoinGlyph({ size, color, text, dashed = false }: { size: number; color: string; text: string; dashed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="inline-block shrink-0" role="img" aria-label={text}>
      <circle cx="8" cy="8" r="7" fill={dashed ? "none" : color} stroke={dashed ? "currentColor" : "rgba(0,0,0,0.25)"} strokeWidth="1" strokeDasharray={dashed ? "2 2" : undefined} opacity={dashed ? 0.6 : 1} />
      <text x="8" y="8.2" textAnchor="middle" dominantBaseline="central" fontSize={text.length > 1 ? 7 : 9} fontFamily="var(--font-mono)" fontWeight="600" fill={dashed ? "currentColor" : "#fff"}>
        {text}
      </text>
    </svg>
  );
}

export function AssetIcon({ asset, size = 16 }: { asset: Pick<Asset, "canonicalAssetId" | "chainId" | "kind" | "verified" | "symbol">; size?: number }) {
  if (!asset.verified) return <CoinGlyph size={size} color="var(--muted)" text="?" dashed />;
  const id = asset.canonicalAssetId;
  if (id === "ETH") return <EthGlyph size={size} />;
  if (id === "WETH") return <EthGlyph size={size} outlined />;
  if (id === "USDC") return <CoinGlyph size={size} color="#2775CA" text="$" />;
  const chain = findChain(asset.chainId);
  const letter = asset.symbol.replace(/^W/, "").slice(0, 1) || "?";
  return <CoinGlyph size={size} color={chain?.color ?? "#90959F"} text={letter} />;
}

/** Chain + asset pair, e.g. next to an amount. */
export function AssetChainIcon({ asset, size = 18 }: { asset: Pick<Asset, "canonicalAssetId" | "chainId" | "kind" | "verified" | "symbol">; size?: number }) {
  const small = Math.round(size * 0.55);
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size + small / 2, height: size }}>
      <span className="absolute left-0 top-0">
        <AssetIcon asset={asset} size={size} />
      </span>
      <span className="absolute" style={{ right: 0, bottom: -1 }}>
        <ChainIcon chainId={asset.chainId} size={small} />
      </span>
    </span>
  );
}
