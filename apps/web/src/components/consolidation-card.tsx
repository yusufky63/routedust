"use client";

import { formatAmount, formatSeconds, type ChainGroup, type ConsolidationPlan } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { Button, ExternalLink, Tag } from "./ui";
import { AssetIcon, ChainIcon } from "./icons";
import { findAnyAsset } from "@/lib/assets";
import { edgeLabel, pad2 } from "@/lib/format";

export interface ConsolidationCardProps {
  group: ChainGroup;
  plan: ConsolidationPlan;
  onExecute: (group: ChainGroup) => void;
  disabled?: boolean;
  canExecute: boolean;
  executeHint?: string;
}

/**
 * One pooled bridge per chain: the legs (same-chain swaps / unwraps) are listed
 * with what they land on the hub, then the single bridge quoted for the pool.
 */
export function ConsolidationCard({ group, plan, onExecute, disabled, canExecute, executeHint }: ConsolidationCardProps) {
  const chain = findChain(group.chainId);
  const hub = findAnyAsset(group.hub.assetId);
  const dest = findAnyAsset(group.bridge.destination.assetId);
  const dstChain = findChain(group.bridge.destination.chainId);
  const pooled = group.legs.reduce((acc, l) => acc + l.hubAmount, 0n);
  const saved = group.separateTxCount - group.txCount;
  const gain = group.expectedOut - group.separateOut;
  const faucets = (chain?.faucets ?? []).filter((f) => f.assetId === chain?.nativeAsset.canonicalAssetId || f.assetId === "*").slice(0, 2);

  return (
    <article className="module flex flex-col gap-4 !border-accent/60 !p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.08em]">
          <ChainIcon chainId={group.chainId} size={14} /> {chain?.name} · {group.legs.length} balances → 1 bridge
        </span>
        <div className="flex flex-wrap gap-1">
          <Tag tone="accent">{group.txCount} TX</Tag>
          {saved > 0 ? <Tag tone="ok">SAVES {saved} TX</Tag> : null}
          {group.bridge.requiresDestinationGas ? <Tag>1 DESTINATION CLAIM</Tag> : <Tag tone="ok">NO DESTINATION GAS</Tag>}
          <Tag>{formatSeconds(group.bridge.estimatedSeconds)}</Tag>
        </div>
      </header>

      <ol className="flex flex-col">
        {group.legs.map((leg, i) => {
          const source = plan.sources.find((s) => s.id === leg.sourceId);
          if (!source) return null;
          return (
            <li key={leg.sourceId} className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="flex items-center gap-2 text-sm">
                <span className="mono text-xs text-muted">{pad2(i + 1)} /</span>
                <AssetIcon asset={source.asset} size={16} />
                <span className="num">
                  {formatAmount(leg.candidate?.amountIn ?? leg.hubAmount, source.asset.decimals)} {source.asset.symbol}
                </span>
                <span className="mono text-[11px] text-muted">
                  {leg.candidate ? leg.candidate.edges.map((e) => edgeLabel(e.type, e.provider)).join(" → ") : "already the hub asset"}
                </span>
              </span>
              <span className="mono num text-[11px] text-muted">
                → {formatAmount(leg.hubAmount, hub?.decimals ?? 6)} {hub?.symbol}
              </span>
            </li>
          );
        })}
        <li className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="mono text-xs text-muted">{pad2(group.legs.length + 1)} /</span>
            {hub ? <AssetIcon asset={hub} size={16} /> : null}
            <span className="num">
              ≈ {formatAmount(pooled, hub?.decimals ?? 6)} {hub?.symbol}
            </span>
            <span className="mono text-[11px] text-muted">{group.bridge.edges.map((e) => `${edgeLabel(e.type, e.provider)}${e.healthNote ? ` (${e.healthNote.split(" · ")[0]})` : ""}`).join(" → ")}</span>
          </span>
          <span className="mono num text-[11px] text-muted">pooled balance at run time, capped at the plan amount</span>
        </li>
      </ol>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr] md:items-end">
        <div>
          <span className="label">Receive on {dstChain?.shortName}</span>
          <div className="display num flex items-center gap-2 text-2xl leading-none md:text-3xl">
            {dest ? <AssetIcon asset={dest} size={20} /> : null}
            <span>
              {formatAmount(group.expectedOut, dest?.decimals ?? 6)} <span className="text-lg text-muted">{dest?.symbol}</span>
            </span>
          </div>
          <div className="mono mt-1 text-[11px] text-muted">
            separately {formatAmount(group.separateOut, dest?.decimals ?? 6)} {dest?.symbol} in {group.separateTxCount} tx
            {gain !== 0n ? ` · ${gain > 0n ? "+" : ""}${formatAmount(gain, dest?.decimals ?? 6)} pooled` : ""}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {group.gasShortfall ? (
            <span className="mono flex flex-wrap items-center gap-x-3 text-[11px] text-warning">
              needs about {formatAmount(group.gasShortfall, 18, { maxFractionDigits: 6 })} more {chain?.nativeAsset.symbol} on {chain?.shortName} for the pooled bridge
              {faucets.map((f) => (
                <ExternalLink key={f.id} href={f.url}>
                  {f.name}
                </ExternalLink>
              ))}
            </span>
          ) : null}
          <Button variant="solid" onClick={() => onExecute(group)} disabled={disabled || !canExecute || Boolean(group.gasShortfall)} title={executeHint}>
            Execute pooled
          </Button>
          {executeHint ? <span className="mono text-[11px] text-muted">{executeHint}</span> : null}
        </div>
      </div>
    </article>
  );
}
