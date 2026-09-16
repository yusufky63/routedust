"use client";

import { useState } from "react";
import { formatAmount, formatSeconds, type RouteCandidate, type SourcePlan } from "@testnet-router/core";
import { findAsset, findChain } from "@testnet-router/registry";
import { RouteProvenance } from "./provenance";
import { Button, Marker, Rule, Tag } from "./ui";
import { CANON_LABEL, HEALTH_LABEL, chainName, edgeLabel, pad2 } from "@/lib/format";

function PathLine({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="mono flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.06em]">
      {candidate.edges.map((e, i) => (
        <span key={e.id} className="flex items-center gap-2">
          <span>{edgeLabel(e.type, e.provider)}</span>
          {i < candidate.edges.length - 1 ? <span className="text-muted">→</span> : null}
        </span>
      ))}
    </div>
  );
}

function CandidateTags({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Tag>{candidate.txCount} TX</Tag>
      <Tag tone={candidate.health === "QUOTED" || candidate.health === "SIMULATED" ? "ok" : "warn"}>{HEALTH_LABEL[candidate.health]}</Tag>
      <Tag tone={candidate.outputCanonicality === "WRAPPED" ? "warn" : "accent"}>{CANON_LABEL[candidate.outputCanonicality]}</Tag>
      {candidate.reliabilityClass === "BEST_EFFORT_TESTNET" ? <Tag tone="warn">TESTNET BEST EFFORT</Tag> : null}
      {candidate.reliabilityClass === "LIQUIDITY" ? <Tag>DEX LIQUIDITY</Tag> : null}
      <Tag>{formatSeconds(candidate.estimatedSeconds)}</Tag>
      {candidate.excludedBy ? <Tag tone="err">EXCLUDED · {candidate.excludedBy.replace(/_/g, " ")}</Tag> : null}
    </div>
  );
}

export function RouteCard({
  index,
  source,
  onExecute,
  disabled,
}: {
  index: number;
  source: SourcePlan;
  onExecute: (candidate: RouteCandidate) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<"alts" | "why" | null>(null);
  const selected = source.selected;
  if (!selected) return null;
  const dest = findAsset(selected.destination.assetId);
  const srcChain = findChain(source.sourceChainId);
  const dstChain = findChain(selected.destination.chainId);
  const alternatives = source.candidates.filter((c) => c.id !== selected.id);
  const destGas = selected.requiresDestinationGas && selected.destination.chainId !== source.sourceChainId;

  return (
    <article className="module flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="label">ROUTE / {pad2(index)}</span>
        <span className="label">{source.asset.symbol} · {srcChain?.shortName}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div>
          <div className="display num text-3xl leading-none md:text-4xl">
            {formatAmount(selected.amountIn, source.asset.decimals)} <span className="text-muted">{source.asset.symbol}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em]">
            <Marker color={srcChain?.color} />
            {chainName(source.sourceChainId)}
          </div>
        </div>
        <div className="mono hidden text-muted md:block" aria-hidden>
          ──────→
        </div>
        <div className="md:text-right">
          <div className="display num text-3xl leading-none md:text-4xl">
            {formatAmount(selected.amountOut, dest?.decimals ?? 6)} <span className="text-muted">{dest?.symbol}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] md:justify-end">
            <Marker color={dstChain?.color} />
            {chainName(selected.destination.chainId)}
          </div>
        </div>
      </div>
      <Rule />
      <PathLine candidate={selected} />
      <CandidateTags candidate={selected} />
      <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>
          gas reserve {formatAmount(source.gas.reserve, 18)} {srcChain?.nativeAsset.symbol}
        </span>
        <span>min out {formatAmount(selected.minAmountOut, dest?.decimals ?? 6)} {dest?.symbol}</span>
        {destGas ? <span className="text-warning">destination mint needs {dstChain?.nativeAsset.symbol} on {dstChain?.shortName}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="solid" onClick={() => onExecute(selected)} disabled={disabled}>
          Execute
        </Button>
        <Button active={open === "alts"} onClick={() => setOpen(open === "alts" ? null : "alts")} disabled={alternatives.length === 0}>
          Alternatives ({alternatives.length})
        </Button>
        <Button active={open === "why"} onClick={() => setOpen(open === "why" ? null : "why")}>
          Why this route?
        </Button>
      </div>
      {open === "alts" ? (
        <div className="flex flex-col gap-3">
          <Rule />
          {alternatives.map((c, i) => (
            <div key={c.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="mono text-xs text-muted">{pad2(i + 2)}</span>
                  <span className="display num text-lg">
                    {formatAmount(c.amountOut, dest?.decimals ?? 6)} {dest?.symbol}
                  </span>
                </div>
                <Button onClick={() => onExecute(c)} disabled={disabled || Boolean(c.excludedBy)}>
                  Use this
                </Button>
              </div>
              <PathLine candidate={c} />
              <CandidateTags candidate={c} />
            </div>
          ))}
        </div>
      ) : null}
      {open === "why" ? (
        <div>
          <Rule className="mb-4" />
          <RouteProvenance candidate={selected} />
        </div>
      ) : null}
      {source.notes.length > 0 ? (
        <details className="text-xs text-muted">
          <summary className="label">Planner notes ({source.notes.length})</summary>
          <ul className="mono mt-2 flex flex-col gap-1">
            {source.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
