"use client";

import Link from "next/link";
import { useState } from "react";
import { formatAmount, type RouteExecution } from "@testnet-router/core";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { BurnsPanel } from "@/components/burns-panel";
import { Button, Empty, LinkAction, PageTitle, Tag, useMounted } from "@/components/ui";
import { AssetIcon, ChainIcon } from "@/components/icons";
import { EXEC_STATE_LABEL, chainShort, edgeLabel, pad2, timeAgo } from "@/lib/format";
import { useRouterStore, type Batch } from "@/lib/store";

type Tone = "ok" | "warn" | "err" | "muted" | "accent";

function stateTone(state: RouteExecution["state"]): Tone {
  if (state === "COMPLETED") return "ok";
  if (state === "FAILED") return "err";
  if (state === "PAUSED") return "warn";
  if (state === "PLANNED") return "muted";
  return "accent";
}

/** A CCTP burn was sent but the destination mint has not completed. */
function hasUnmintedBurn(ex: RouteExecution): boolean {
  return ex.state !== "COMPLETED" && ex.steps.some((s) => s.type === "BRIDGE" && s.provider === "circle-cctp" && Boolean(s.txHash));
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="display border-b border-border pb-2 text-lg">
      {title} <span className="text-muted">/ {pad2(count)}</span>
    </h2>
  );
}

/** One segment per step, coloured by the step's outcome. */
function StepProgress({ execution }: { execution: RouteExecution }) {
  if (execution.steps.length === 0) return null;
  return (
    <div className="flex gap-1" aria-hidden>
      {execution.steps.map((s) => {
        const cls =
          s.status === "COMPLETED" || s.status === "CONFIRMED"
            ? "bg-success"
            : s.status === "FAILED"
              ? "bg-error"
              : s.status === "SKIPPED"
                ? "bg-border-strong"
                : s.status === "PENDING"
                  ? "bg-border"
                  : "bg-accent";
        return <span key={s.id} className={`h-1 flex-1 rounded-xs ${cls}`} title={`${s.label}: ${s.status}`} />;
      })}
    </div>
  );
}

function ExecutionCard({ ex, onArchive, onRestore }: { ex: RouteExecution; onArchive: () => void; onRestore: () => void }) {
  const c = ex.candidate;
  const dest = findAsset(c.destination.assetId);
  const out = ex.edges[ex.edges.length - 1]?.amountOut ?? c.amountOut;
  const done = ex.steps.filter((s) => s.status === "COMPLETED" || s.status === "CONFIRMED" || s.status === "SKIPPED").length;
  const completed = ex.state === "COMPLETED";
  const path = c.edges.map((e) => edgeLabel(e.type, e.provider)).join(" → ");
  return (
    <article className={`module col-span-4 flex flex-col gap-4 md:col-span-6 xl:col-span-4 ${ex.archivedAt ? "opacity-60" : ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-caps">
          <ChainIcon chainId={c.sourceChainId} size={14} /> {chainShort(c.sourceChainId)}
          <span className="text-muted" aria-hidden>
            →
          </span>
          <ChainIcon chainId={c.destination.chainId} size={14} /> {chainShort(c.destination.chainId)}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {hasUnmintedBurn(ex) ? <Tag tone="warn">BURNED · NOT MINTED</Tag> : null}
          <Tag tone={stateTone(ex.state)}>{EXEC_STATE_LABEL[ex.state]}</Tag>
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <span className="label">Sent</span>
          <div className="display num mt-1 flex items-center gap-2 text-lg leading-tight">
            <AssetIcon asset={c.sourceAsset} size={18} />
            <span className="truncate">
              {formatAmount(c.amountIn, c.sourceAsset.decimals)} <span className="text-sm text-muted">{c.sourceAsset.symbol}</span>
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <span className="label">{completed ? "Received" : "Expected"}</span>
          <div className="display num mt-1 flex items-center gap-2 text-lg leading-tight">
            {dest ? <AssetIcon asset={dest} size={18} /> : null}
            <span className="truncate">
              {formatAmount(out, dest?.decimals ?? 6)} <span className="text-sm text-muted">{dest?.symbol}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="meta truncate" title={path}>
          {path}
        </p>
        <StepProgress execution={ex} />
        <p className="meta">
          {done}/{ex.steps.length} steps · {timeAgo(ex.updatedAt)}
          {ex.archivedAt ? " · archived" : ""}
        </p>
        {ex.error && !completed ? (
          <p className="meta truncate text-error" title={ex.error.message}>
            {ex.error.code}: {ex.error.message}
          </p>
        ) : null}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link href={`/route/${ex.id}`} className="btn">
          Open route
        </Link>
        {ex.archivedAt ? (
          <LinkAction onClick={onRestore} title="Bring back to the main list">
            Restore
          </LinkAction>
        ) : (
          <LinkAction onClick={onArchive} title="Archive (kept in history)">
            Archive
          </LinkAction>
        )}
      </footer>
    </article>
  );
}

function BatchCard({ batch, executions, onRemove }: { batch: Batch; executions: Record<string, RouteExecution>; onRemove: () => void }) {
  const items = batch.executionIds.map((id) => executions[id]).filter((e): e is RouteExecution => Boolean(e));
  const completed = items.filter((e) => e.state === "COMPLETED").length;
  const failed = items.filter((e) => e.state === "FAILED").length;
  const tone: Tone = failed ? "err" : items.length > 0 && completed === items.length ? "ok" : "accent";
  return (
    <article className="module col-span-4 flex flex-col gap-3 md:col-span-6 xl:col-span-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="display truncate text-base">{batch.label}</div>
          <div className="meta">
            {items.length} routes · {timeAgo(batch.createdAt)}
          </div>
        </div>
        <Tag tone={tone}>
          {completed}/{items.length} done{failed ? ` · ${failed} failed` : ""}
        </Tag>
      </header>
      {items.length > 0 ? (
        <div className="flex gap-1" aria-hidden>
          {items.map((e) => (
            <span
              key={e.id}
              className={`h-1 flex-1 rounded-xs ${e.state === "COMPLETED" ? "bg-success" : e.state === "FAILED" ? "bg-error" : e.state === "PAUSED" ? "bg-warning" : e.state === "PLANNED" ? "bg-border" : "bg-accent"}`}
            />
          ))}
        </div>
      ) : null}
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link href={`/batch/${batch.id}`} className="btn">
          Open batch
        </Link>
        <LinkAction onClick={onRemove} title="Remove the grouping; its routes stay in history">
          Ungroup
        </LinkAction>
      </footer>
    </article>
  );
}

export default function ActivityPage() {
  const mounted = useMounted();
  const executions = useRouterStore((s) => s.executions);
  const batches = useRouterStore((s) => s.batches);
  const archive = useRouterStore((s) => s.removeExecution);
  const restore = useRouterStore((s) => s.restoreExecution);
  const removeBatch = useRouterStore((s) => s.removeBatch);
  const [showArchived, setShowArchived] = useState(false);
  if (!mounted) return null;

  const all = Object.values(executions).sort((a, b) => b.updatedAt - a.updatedAt);
  const archivedCount = all.filter((e) => e.archivedAt).length;
  const list = all.filter((e) => showArchived || !e.archivedAt);
  const batchList = Object.values(batches).sort((a, b) => b.createdAt - a.createdAt);

  const completed = list.filter((e) => e.state === "COMPLETED").length;
  const attention = list.filter((e) => e.state === "FAILED" || e.state === "PAUSED").length;
  const inFlight = list.length - completed - attention;
  const unminted = list.filter(hasUnmintedBurn).length;
  const summary: { label: string; value: number; tone?: string }[] = [
    { label: "Completed", value: completed, tone: completed ? "text-success" : undefined },
    { label: "In progress", value: inFlight, tone: inFlight ? "text-accent" : undefined },
    { label: "Needs attention", value: attention, tone: attention ? "text-warning" : undefined },
    { label: "Unminted burns", value: unminted, tone: unminted ? "text-error" : undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Activity" meta="Execution history, stored in this browser. Routes are archived, never deleted.">
        {archivedCount > 0 ? (
          <Button active={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </Button>
        ) : null}
      </PageTitle>

      {list.length > 0 ? (
        <div className="module-raised grid grid-cols-2 gap-4 md:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label}>
              <div className={`display num text-2xl leading-none ${s.tone ?? ""}`}>{pad2(s.value)}</div>
              <div className="label mt-2">{s.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      <BurnsPanel />

      {list.length === 0 && batchList.length === 0 ? <Empty title="No executions yet" hint="Plan a route and execute it; every run shows up here." action={{ href: "/", label: "Plan a route" }} /> : null}

      {batchList.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading title="Batches" count={batchList.length} />
          <div className="grid-12">
            {batchList.map((b) => (
              <BatchCard key={b.id} batch={b} executions={executions} onRemove={() => removeBatch(b.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {list.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading title="Routes" count={list.length} />
          <div className="grid-12">
            {list.map((ex) => (
              <ExecutionCard key={ex.id} ex={ex} onArchive={() => archive(ex.id)} onRestore={() => restore(ex.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
