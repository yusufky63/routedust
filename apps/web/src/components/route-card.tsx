"use client";

import { useState } from "react";
import { formatAmount, formatSeconds, type RouteCandidate, type RouteEdge, type SourcePlan } from "@testnet-router/core";
import { findAsset, findChain } from "@testnet-router/registry";
import { RouteProvenance } from "./provenance";
import { Button, Marker, Tag } from "./ui";
import { CANON_LABEL, HEALTH_LABEL, chainName, pad2 } from "@/lib/format";

const PROVIDER_NAME: Record<string, string> = {
  uniswap: "Uniswap v3",
  "circle-cctp": "Circle CCTP",
  across: "Across",
  "op-standard-bridge": "OP Standard Bridge",
  wrap: "Wrapped native",
};

const TYPE_LABEL: Record<string, string> = {
  SWAP: "Swap",
  CCTP: "Bridge",
  ACROSS: "Bridge",
  OP_STANDARD_BRIDGE: "Bridge",
  WRAP: "Wrap",
  UNWRAP: "Unwrap",
  CIRCLE_GATEWAY: "Deposit",
  LIFI: "Bridge",
  STARGATE: "Bridge",
  LAYERZERO_OFT: "Bridge",
  WORMHOLE_NTT: "Bridge",
  WORMHOLE_WRAPPED: "Bridge",
  HYPERLANE_WARP: "Bridge",
  SUPERCHAIN_INTEROP: "Bridge",
};

function StepBlock({ edge, index }: { edge: RouteEdge; index: number }) {
  const to = findAsset(edge.to.assetId);
  const detail = edge.healthNote?.replace(/^pool 0x[0-9a-fA-F]+ /, "") ?? "";
  return (
    <div className="flex min-w-[10rem] flex-col gap-1">
      <div className="label">
        {pad2(index)} · {TYPE_LABEL[edge.type] ?? edge.type}
        {edge.crossChain ? ` → ${findChain(edge.to.chainId)?.shortName}` : ""}
      </div>
      <div className="text-sm">{PROVIDER_NAME[edge.provider] ?? edge.provider}</div>
      <div className="mono num text-[11px] text-muted">
        {formatAmount(edge.quote.amountOut, to?.decimals ?? 18)} {to?.symbol}
        {detail ? ` · ${detail}` : ""}
      </div>
    </div>
  );
}

function StepFlow({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
      {candidate.edges.map((e, i) => (
        <div key={e.id} className="flex items-start gap-6">
          <StepBlock edge={e} index={i + 1} />
          {i < candidate.edges.length - 1 ? (
            <span className="mono mt-4 text-muted" aria-hidden>
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CandidateTags({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag>{candidate.txCount} TX</Tag>
      <Tag tone={candidate.health === "QUOTED" || candidate.health === "SIMULATED" ? "ok" : "warn"}>{HEALTH_LABEL[candidate.health]}</Tag>
      <Tag tone={candidate.outputCanonicality === "WRAPPED" ? "warn" : "accent"}>{CANON_LABEL[candidate.outputCanonicality]}</Tag>
      {candidate.reliabilityClass === "BEST_EFFORT_TESTNET" ? <Tag tone="warn">TESTNET BEST EFFORT</Tag> : null}
      <Tag>{formatSeconds(candidate.estimatedSeconds)}</Tag>
      {candidate.excludedBy ? <Tag tone="err">EXCLUDED · {candidate.excludedBy.replace(/_/g, " ")}</Tag> : null}
    </div>
  );
}

function AmountPair({ source, candidate }: { source: SourcePlan; candidate: RouteCandidate }) {
  const dest = findAsset(candidate.destination.assetId);
  const srcChain = findChain(source.sourceChainId);
  const dstChain = findChain(candidate.destination.chainId);
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr] md:items-end">
      <div className="flex flex-col gap-3">
        <span className="label">Send</span>
        <div className="display num text-4xl leading-none md:text-5xl">
          {formatAmount(candidate.amountIn, source.asset.decimals)} <span className="text-2xl text-muted md:text-3xl">{source.asset.symbol}</span>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.1em]">
          <Marker color={srcChain?.color} />
          {chainName(source.sourceChainId)}
        </div>
      </div>
      <div className="mono hidden pb-8 text-lg text-muted md:block" aria-hidden>
        ⟶
      </div>
      <div className="flex flex-col gap-3 md:items-end md:text-right">
        <span className="label">Receive</span>
        <div className="display num text-4xl leading-none md:text-5xl">
          {formatAmount(candidate.amountOut, dest?.decimals ?? 6)} <span className="text-2xl text-muted md:text-3xl">{dest?.symbol}</span>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.1em]">
          <Marker color={dstChain?.color} />
          {chainName(candidate.destination.chainId)}
        </div>
      </div>
    </div>
  );
}

export function RouteCard({
  index,
  source,
  onExecute,
  disabled,
  executeHint,
}: {
  index: number;
  source: SourcePlan;
  onExecute: (candidate: RouteCandidate) => void;
  disabled?: boolean;
  /** Shown next to the execute button when execution is not possible (e.g. watching an address). */
  executeHint?: string;
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
    <article className="module flex flex-col gap-8 !p-6 md:!p-8">
      <header className="flex items-center justify-between">
        <span className="label">Route / {pad2(index)}</span>
        <span className="label">{srcChain?.shortName} · {source.asset.symbol}</span>
      </header>

      <AmountPair source={source} candidate={selected} />

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <span className="label">Steps</span>
        <StepFlow candidate={selected} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <CandidateTags candidate={selected} />
        <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
          <span>
            gas reserved {formatAmount(source.gas.reserve, 18)} {srcChain?.nativeAsset.symbol}
          </span>
          <span>
            minimum received {formatAmount(selected.minAmountOut, dest?.decimals ?? 6)} {dest?.symbol}
          </span>
          {destGas ? (
            <span className="text-warning">
              destination mint needs {dstChain?.nativeAsset.symbol} on {dstChain?.shortName}
            </span>
          ) : null}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button variant="solid" onClick={() => onExecute(selected)} disabled={disabled} title={executeHint}>
          Execute
        </Button>
        {executeHint ? <span className="mono text-[11px] text-muted">{executeHint}</span> : null}
        <span className="flex-1" />
        <button
          type="button"
          className={`mono border-b text-[11px] uppercase tracking-[0.08em] ${open === "alts" ? "border-text" : "border-transparent text-muted hover:text-text"} disabled:opacity-40`}
          onClick={() => setOpen(open === "alts" ? null : "alts")}
          disabled={alternatives.length === 0}
        >
          Alternatives ({alternatives.length})
        </button>
        <button
          type="button"
          className={`mono border-b text-[11px] uppercase tracking-[0.08em] ${open === "why" ? "border-text" : "border-transparent text-muted hover:text-text"}`}
          onClick={() => setOpen(open === "why" ? null : "why")}
        >
          Why this route?
        </button>
      </footer>

      {open === "alts" ? (
        <div className="flex flex-col gap-6 border-t border-border pt-6">
          {alternatives.map((c, i) => (
            <div key={c.id} className="module-raised flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="label">Alternative {pad2(i + 1)}</span>
                  <span className="display num text-2xl">
                    {formatAmount(c.amountOut, dest?.decimals ?? 6)} <span className="text-muted">{dest?.symbol}</span>
                  </span>
                </div>
                <Button onClick={() => onExecute(c)} disabled={disabled || Boolean(c.excludedBy)}>
                  Use this route
                </Button>
              </div>
              <StepFlow candidate={c} />
              <CandidateTags candidate={c} />
            </div>
          ))}
        </div>
      ) : null}

      {open === "why" ? (
        <div className="border-t border-border pt-6">
          <RouteProvenance candidate={selected} />
        </div>
      ) : null}

      {source.notes.length > 0 ? (
        <details className="text-xs text-muted">
          <summary className="label">Planner notes ({source.notes.length})</summary>
          <ul className="mono mt-3 flex flex-col gap-1">
            {source.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
