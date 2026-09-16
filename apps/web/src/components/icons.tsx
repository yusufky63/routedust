"use client";

import { useState } from "react";
import type { Asset } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { assetLogo, chainLogo } from "@/lib/logos";

/**
 * Chain and asset marks: real logos where a stable public image exists,
 * a typographic monogram otherwise (spec section 30: small marks only).
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

function Monogram({ text, color, size, round = false }: { text: string; color: string; size: number; round?: boolean }) {
  const fontSize = text.length > 1 ? 8 : 10;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="inline-block shrink-0" aria-hidden>
      {round ? <circle cx="8" cy="8" r="7.5" fill={color} /> : <rect x="0.5" y="0.5" width="15" height="15" rx="3" fill={color} />}
      <text x="8" y="8.3" textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontFamily="var(--font-mono)" fontWeight="600" fill="#fff">
        {text}
      </text>
    </svg>
  );
}

function Logo({ src, alt, size, round, className = "" }: { src: string; alt: string; size: number; round: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 ${round ? "rounded-full" : "rounded-[3px]"} bg-raised ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function ChainIcon({ chainId, size = 16, className = "" }: { chainId: number; size?: number; className?: string }) {
  const chain = findChain(chainId);
  const src = chainLogo(chainId);
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={chain?.name ?? `chain ${chainId}`}
        title={chain?.name}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`inline-block shrink-0 rounded-[3px] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span title={chain?.name} aria-label={chain?.name} className={className}>
      <Monogram text={CHAIN_MONOGRAM[chainId] ?? chain?.shortName?.[0] ?? "?"} color={chain?.color ?? "#90959F"} size={size} />
    </span>
  );
}

export function AssetIcon({ asset, size = 16 }: { asset: Pick<Asset, "canonicalAssetId" | "chainId" | "kind" | "verified" | "symbol">; size?: number }) {
  if (!asset.verified) return <Monogram text="?" color="#90959F" size={size} round />;
  const src = assetLogo(asset.canonicalAssetId);
  if (src) return <Logo src={src} alt={asset.symbol} size={size} round />;
  const chain = findChain(asset.chainId);
  return <Monogram text={asset.symbol.replace(/^W/, "").slice(0, 1) || "?"} color={chain?.color ?? "#90959F"} size={size} round />;
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
