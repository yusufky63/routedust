"use client";

import { formatAmount, formatSeconds } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { Button, Tag } from "./ui";
import { AssetIcon, ChainIcon } from "./icons";
import { findAnyAsset } from "@/lib/assets";
import { pad2 } from "@/lib/format";
import type { GatewaySetView } from "@/hooks/use-gateway-set";

export interface GatewaySetCardProps {
  view: GatewaySetView;
  onExecute: (view: GatewaySetView) => void;
  disabled?: boolean;
  canExecute: boolean;
  executeHint?: string;
}

/**
 * Circle Gateway pooled transfer: one deposit per chain, then a single
 * signature spends all of them and Circle mints once on the target.
 */
export function GatewaySetCard({ view, onExecute, disabled, canExecute, executeHint }: GatewaySetCardProps) {
  const { set } = view;
  const dest = findAnyAsset(set.collector.destination.assetId);
  const dstChain = findChain(set.collector.destination.chainId);
  const txCount = set.legs.reduce((acc, l) => acc + l.txCount, 0);
  const gain = set.totalOut - view.separateOut;

  return (
    <article className="module flex flex-col gap-4 border-accent/60">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs uppercase tracking-label">
          Circle Gateway · {set.legs.length} chains → 1 signature → 1 mint
        </span>
        <div className="flex flex-wrap gap-1">
          <Tag tone="accent">{txCount} TX + 1 SIGNATURE</Tag>
          {view.rescued > 0 ? <Tag tone="ok">{view.rescued} WITHOUT A ROUTE ALONE</Tag> : null}
          <Tag tone="ok">NO DESTINATION GAS</Tag>
          <Tag>{formatSeconds(set.collector.estimatedSeconds)}</Tag>
        </div>
      </header>

      <ol className="flex flex-col">
        {set.legs.map((leg, i) => (
          <li key={leg.id} className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-sm">
              <span className="mono text-xs text-muted">{pad2(i + 1)} /</span>
              <ChainIcon chainId={leg.sourceChainId} size={14} />
              <AssetIcon asset={leg.sourceAsset} size={16} />
              <span className="num">
                {formatAmount(leg.amountIn, leg.sourceAsset.decimals)} {leg.sourceAsset.symbol}
              </span>
              <span className="mono text-xs text-muted">{findChain(leg.sourceChainId)?.shortName} · approve + deposit</span>
            </span>
            <span className="mono text-xs text-muted">→ Gateway balance</span>
          </li>
        ))}
        <li className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="mono text-xs text-muted">{pad2(set.legs.length + 1)} /</span>
            <span>One burn intent set signature, minted by Circle on {dstChain?.shortName}</span>
          </span>
          <span className="mono num text-xs text-muted">
            fee {formatAmount(set.totalFee, 6)} USDC{set.forwardingFee ? ` · forwarding ${set.forwardingFee} charged once` : ""}
          </span>
        </li>
      </ol>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr] md:items-end">
        <div>
          <span className="label">Receive on {dstChain?.shortName}</span>
          <div className="display num flex items-center gap-2 text-2xl leading-none md:text-3xl">
            {dest ? <AssetIcon asset={dest} size={20} /> : null}
            <span>
              {formatAmount(set.totalOut, dest?.decimals ?? 6)} <span className="text-lg text-muted">{dest?.symbol}</span>
            </span>
          </div>
          <div className="mono mt-1 text-xs text-muted">
            separately {formatAmount(view.separateOut, dest?.decimals ?? 6)} {dest?.symbol} in {view.separateTxCount} tx
            {gain !== 0n ? ` · ${gain > 0n ? "+" : "−"}${formatAmount(gain > 0n ? gain : -gain, dest?.decimals ?? 6)} pooled` : ""}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <span className="mono text-xs text-muted md:text-right">Deposits wait for source finality (seconds to ~15 min). Until the signature, funds stay in your own Gateway balance.</span>
          <Button variant="solid" onClick={() => onExecute(view)} disabled={disabled || !canExecute} title={executeHint}>
            Execute pooled
          </Button>
          {executeHint ? <span className="mono text-xs text-muted">{executeHint}</span> : null}
        </div>
      </div>
    </article>
  );
}
