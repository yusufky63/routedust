"use client";

import { useEffect, useState } from "react";
import { formatAmount, formatSeconds, parseAmount, type RouteCandidate, type RouteEdge, type SourcePlan } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { RouteProvenance } from "./provenance";
import { Button, Marker, Tag } from "./ui";
import type { AmountState } from "@/hooks/use-route-amounts";
import { currentAssets } from "@/lib/assets";
import { CANON_LABEL, HEALTH_LABEL, pad2 } from "@/lib/format";

/** Registry + wallet-discovered + user-added assets (unverified tokens included). */
function findAsset(id: string) {
  return currentAssets().find((a) => a.id === id);
}

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
  SUPERCHAIN_INTEROP: "Bridge",
  LIFI: "Bridge",
  STARGATE: "Bridge",
  LAYERZERO_OFT: "Bridge",
  WORMHOLE_NTT: "Bridge",
  WORMHOLE_WRAPPED: "Bridge",
  HYPERLANE_WARP: "Bridge",
};

const PCT_PRESETS = [25, 50, 75, 100];

function stepDetail(edge: RouteEdge): string {
  const note = edge.healthNote ?? "";
  if (edge.type === "SWAP") return note.replace(/^pool 0x[0-9a-fA-F]+ /, "");
  if (edge.type === "CCTP") return note.startsWith("Fast") ? "fast" : "standard";
  return "";
}

function StepFlow({ candidate, dense = false }: { candidate: RouteCandidate; dense?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center ${dense ? "gap-x-2 gap-y-1" : "gap-x-3 gap-y-2"}`}>
      {candidate.edges.map((e, i) => {
        const detail = stepDetail(e);
        return (
          <span key={e.id} className="flex items-center gap-2">
            <span className="flex flex-col leading-tight">
              <span className="label">
                {pad2(i + 1)} {TYPE_LABEL[e.type] ?? e.type}
                {e.crossChain ? ` → ${findChain(e.to.chainId)?.shortName}` : ""}
              </span>
              <span className="text-xs">
                {PROVIDER_NAME[e.provider] ?? e.provider}
                {detail ? <span className="mono text-muted"> · {detail}</span> : null}
              </span>
            </span>
            {i < candidate.edges.length - 1 ? (
              <span className="mono px-1 text-muted" aria-hidden>
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function CandidateTags({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Tag>{candidate.txCount} TX</Tag>
      <Tag tone={candidate.health === "QUOTED" || candidate.health === "SIMULATED" ? "ok" : "warn"}>{HEALTH_LABEL[candidate.health]}</Tag>
      <Tag tone={candidate.outputCanonicality === "WRAPPED" ? "warn" : "accent"}>{CANON_LABEL[candidate.outputCanonicality]}</Tag>
      {candidate.reliabilityClass === "BEST_EFFORT_TESTNET" ? <Tag tone="warn">BEST EFFORT</Tag> : null}
      {candidate.priceImpactBps !== undefined ? (
        <Tag tone={candidate.priceImpactBps > 500 ? "err" : candidate.priceImpactBps > 100 ? "warn" : "muted"} title="DEX price impact of this size versus the marginal pool price">
          IMPACT {(candidate.priceImpactBps / 100).toFixed(2)}%
        </Tag>
      ) : null}
      <Tag>{formatSeconds(candidate.estimatedSeconds)}</Tag>
      {candidate.excludedBy ? <Tag tone="err">EXCLUDED · {candidate.excludedBy.replace(/_/g, " ")}</Tag> : null}
    </div>
  );
}

export interface RouteCardProps {
  index: number;
  source: SourcePlan;
  /** Included in the batch selection. */
  checked: boolean;
  onToggle: () => void;
  amountState?: AmountState;
  onAmountChange: (amount: bigint, pct?: number) => void;
  onAmountReset: () => void;
  onExecute: (candidate: RouteCandidate) => void;
  /** Planner / scanner busy: freeze the card. */
  disabled?: boolean;
  /** Whether the connected wallet may execute (false while watching an address). */
  canExecute: boolean;
  executeHint?: string;
}

export function RouteCard({
  index,
  source,
  checked,
  onToggle,
  amountState,
  onAmountChange,
  onAmountReset,
  onExecute,
  disabled,
  canExecute,
  executeHint,
}: RouteCardProps) {
  const [open, setOpen] = useState<"alts" | "why" | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [draftError, setDraftError] = useState<string | undefined>(undefined);
  const base = source.selected;

  const amountIn = amountState?.amount ?? base?.amountIn ?? 0n;
  const effective = amountState ? amountState.candidate : base;

  // Mirror preset clicks / resets into the text field, but never clobber what the user is typing.
  useEffect(() => {
    if (dirty) return;
    setDraft(formatAmount(amountIn, source.asset.decimals, { grouping: false, maxFractionDigits: 8 }));
    setDraftError(undefined);
  }, [amountIn, source.asset.decimals, dirty]);

  if (!base) return null;
  const dest = findAsset(base.destination.assetId);
  const srcChain = findChain(source.sourceChainId);
  const dstChain = findChain(base.destination.chainId);
  const alternatives = source.candidates.filter((c) => c.id !== base.id);
  const destGas = base.requiresDestinationGas && base.destination.chainId !== source.sourceChainId;
  const activePct = amountState ? amountState.pct : 100;
  const quoting = amountState?.quoting ?? false;
  const quoteError = amountState?.error;

  const commitDraft = () => {
    if (!dirty) return;
    setDirty(false);
    let parsed: bigint;
    try {
      parsed = parseAmount(draft, source.asset.decimals);
    } catch {
      setDraftError("invalid amount");
      return;
    }
    if (parsed <= 0n) {
      setDraftError("enter an amount above zero");
      return;
    }
    if (parsed >= source.routable) {
      if (parsed > source.routable) setDraftError(`capped at routable ${formatAmount(source.routable, source.asset.decimals)} ${source.asset.symbol}`);
      onAmountReset();
      return;
    }
    setDraftError(undefined);
    onAmountChange(parsed, undefined);
  };

  const pickPct = (pct: number) => {
    if (pct === 100) {
      onAmountReset();
      return;
    }
    onAmountChange((source.routable * BigInt(pct)) / 100n, pct);
  };

  return (
    <article className={`module flex flex-col gap-4 !p-5 ${checked ? "!border-accent" : ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-[var(--accent)]" aria-label={`Select route ${index}`} />
          <span className="label">Route / {pad2(index)}</span>
          <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.08em]">
            <Marker color={srcChain?.color} /> {srcChain?.name} · {source.asset.symbol}
          </span>
          {source.status === "PARTIAL" ? <Tag tone="warn">PARTIAL</Tag> : null}
          {!source.asset.verified ? <Tag tone="warn" title="Symbol and name are display data; sold only through a live DEX pool">UNVERIFIED TOKEN</Tag> : null}
          {dest && !dest.verified ? <Tag tone="warn" title="Destination token identity is unverified">BUY UNVERIFIED</Tag> : null}
          {base.bridgeCount > 1 ? <Tag>VIA {base.edges.filter((e) => e.crossChain).slice(0, -1).map((e) => findChain(e.to.chainId)?.shortName).join(" · ")}</Tag> : null}
        </label>
        <CandidateTags candidate={effective ?? base} />
      </header>
      {source.status === "PARTIAL" && source.limit ? (
        <p className="mono -mt-1 text-[11px] text-warning">
          {source.limit.reason === "price-impact"
            ? `Selling everything would move the ${PROVIDER_NAME[source.limit.provider] ?? source.limit.provider} pool too much; routing ${formatAmount(source.limit.maxAmountIn, source.asset.decimals)} ${source.asset.symbol} at ${((source.limit.priceImpactBps ?? 0) / 100).toFixed(2)}% impact. Balance is ${formatAmount(source.balance, source.asset.decimals)} ${source.asset.symbol}; raise the impact limit in settings or re-plan later.`
            : `${PROVIDER_NAME[source.limit.provider] ?? source.limit.provider} can take at most ${formatAmount(source.limit.maxAmountIn, source.asset.decimals)} ${source.asset.symbol} right now. Balance is ${formatAmount(source.balance, source.asset.decimals)} ${source.asset.symbol}; re-plan later for the rest.`}
        </p>
      ) : null}
      {!source.asset.verified && source.asset.risk?.transfer === "unknown" ? (
        <p className="mono -mt-1 text-[11px] text-muted">Transfer sanity check could not run for this token ({source.asset.risk.detail ?? "no state override"}); the swap is still simulated before signing.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)] md:items-center">
        <div className="flex flex-col gap-1">
          <span className="label">Send</span>
          <div className="display num text-2xl leading-none md:text-3xl">
            {formatAmount(amountIn, source.asset.decimals)} <span className="text-lg text-muted">{source.asset.symbol}</span>
          </div>
        </div>
        <div className="border-y border-border py-3 md:border-x md:border-y-0 md:px-5 md:py-0">
          <StepFlow candidate={effective ?? base} />
        </div>
        <div className="flex flex-col gap-1 md:items-end md:text-right">
          <span className="label">Receive on {dstChain?.shortName}</span>
          <div className={`display num text-2xl leading-none md:text-3xl ${quoting ? "text-muted" : ""}`}>
            {effective ? formatAmount(effective.amountOut, dest?.decimals ?? 6) : quoting ? "…" : "—"} <span className="text-lg text-muted">{dest?.symbol}</span>
          </div>
          {quoting ? <span className="mono text-[11px] text-muted">re-quoting…</span> : null}
          {quoteError ? <span className="mono text-[11px] text-error">{quoteError}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">Amount</span>
          {PCT_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => pickPct(pct)}
              disabled={disabled}
              className={`btn !px-2.5 !py-1 ${activePct === pct ? "btn-active" : ""}`}
            >
              {pct === 100 ? "MAX" : `${pct}%`}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              inputMode="decimal"
              className="num w-44 !py-1"
              aria-label="Custom amount"
              disabled={disabled}
            />
            <span className="mono text-xs text-muted">{source.asset.symbol}</span>
          </div>
          <span className="mono text-[11px] text-muted">
            of {formatAmount(source.routable, source.asset.decimals)} routable
          </span>
        </div>
        {draftError ? <span className="mono text-[11px] text-warning">{draftError}</span> : null}
      </div>

      <div className="mono flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted">
        <span>
          gas reserved {formatAmount(source.gas.reserve, 18)} {srcChain?.nativeAsset.symbol}
        </span>
        {effective ? (
          <span>
            min received {formatAmount(effective.minAmountOut, dest?.decimals ?? 6)} {dest?.symbol}
          </span>
        ) : null}
        {destGas ? (
          <span className="text-warning">
            destination mint needs {dstChain?.nativeAsset.symbol} on {dstChain?.shortName}
          </span>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button variant="solid" onClick={() => effective && onExecute(effective)} disabled={disabled || !canExecute || !effective || quoting} title={executeHint}>
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
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">Alternatives are quoted for the full routable amount; pick one to execute it as planned.</p>
          {alternatives.map((c, i) => (
            <div key={c.id} className="module-raised flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="label">Alt {pad2(i + 1)}</span>
                  <span className="display num text-xl">
                    {formatAmount(c.amountOut, dest?.decimals ?? 6)} <span className="text-sm text-muted">{dest?.symbol}</span>
                  </span>
                </div>
                <Button onClick={() => onExecute(c)} disabled={disabled || !canExecute || Boolean(c.excludedBy)}>
                  Use this route
                </Button>
              </div>
              <StepFlow candidate={c} dense />
              <CandidateTags candidate={c} />
            </div>
          ))}
        </div>
      ) : null}

      {open === "why" ? (
        <div className="border-t border-border pt-4">
          <RouteProvenance candidate={effective ?? base} />
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
