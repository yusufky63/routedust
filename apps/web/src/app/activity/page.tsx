"use client";

import Link from "next/link";
import { useState } from "react";
import { formatAmount } from "@testnet-router/core";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { BurnsPanel } from "@/components/burns-panel";
import { Button, Empty, Label, PageTitle, Tag, useMounted } from "@/components/ui";
import { ChainIcon } from "@/components/icons";
import { EXEC_STATE_LABEL, chainName, edgeLabel, pad2, timeAgo } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

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

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Activity" meta="Execution history · stored locally in this browser · never deleted, only archived">
        {archivedCount > 0 ? (
          <Button active={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </Button>
        ) : null}
      </PageTitle>

      <BurnsPanel />

      {list.length === 0 && batchList.length === 0 ? <Empty title="No executions yet" action={{ href: "/", label: "Plan a route" }} /> : null}

      {batchList.length > 0 ? (
        <section>
          <Label>Batches / {pad2(batchList.length)}</Label>
          <div className="mt-2 flex flex-col">
            {batchList.map((b) => {
              const items = b.executionIds.map((id) => executions[id]).filter(Boolean);
              const completed = items.filter((e) => e?.state === "COMPLETED").length;
              const failed = items.filter((e) => e?.state === "FAILED").length;
              return (
                <div key={b.id} className="flex flex-col gap-2 border-t border-border py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="display text-lg">{b.label}</div>
                    <div className="mono text-[11px] text-muted">
                      {items.length} routes · {timeAgo(b.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone={failed ? "err" : completed === items.length && items.length > 0 ? "ok" : "warn"}>
                      {completed}/{items.length} DONE{failed ? ` · ${failed} FAILED` : ""}
                    </Tag>
                    <Link href={`/batch/${b.id}`} className="btn">
                      Open
                    </Link>
                    <Button onClick={() => removeBatch(b.id)} title="Remove the batch grouping (its routes stay in history)">
                      ×
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {list.length > 0 ? <Label>Routes / {pad2(list.length)}</Label> : null}
      <div className="-mt-4 flex flex-col">
        {list.map((ex) => {
          const c = ex.candidate;
          const dest = findAsset(c.destination.assetId);
          const tone = ex.state === "COMPLETED" ? "ok" : ex.state === "FAILED" ? "err" : ex.state === "PAUSED" ? "warn" : "warn";
          const burn = ex.steps.find((s) => s.type === "BRIDGE" && s.provider === "circle-cctp" && s.txHash);
          const minted = ex.state === "COMPLETED";
          return (
            <div key={ex.id} className={`flex flex-col gap-2 border-t border-border py-4 md:flex-row md:items-center md:justify-between ${ex.archivedAt ? "opacity-60" : ""}`}>
              <div className="flex flex-col gap-1">
                <div className="display num text-lg">
                  {formatAmount(c.amountIn, c.sourceAsset.decimals)} {c.sourceAsset.symbol} <span className="text-muted">→</span>{" "}
                  {formatAmount(ex.edges[ex.edges.length - 1]?.amountOut ?? c.amountOut, dest?.decimals ?? 6)} {dest?.symbol}
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.06em]">
                  <ChainIcon chainId={c.sourceChainId} size={14} /> {chainName(c.sourceChainId)} <span className="text-muted">→</span>
                  <ChainIcon chainId={c.destination.chainId} size={14} /> {chainName(c.destination.chainId)}
                </div>
                <div className="mono text-[11px] text-muted">
                  {c.edges.map((e) => edgeLabel(e.type, e.provider)).join(" → ")} · {timeAgo(ex.updatedAt)}
                  {ex.archivedAt ? " · archived" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {burn && !minted ? <Tag tone="warn">BURNED · NOT MINTED</Tag> : null}
                <Tag tone={tone}>{EXEC_STATE_LABEL[ex.state]}</Tag>
                <Link href={`/route/${ex.id}`} className="btn">
                  Open
                </Link>
                {ex.archivedAt ? (
                  <Button onClick={() => restore(ex.id)} title="Bring back to the main list">
                    Restore
                  </Button>
                ) : (
                  <Button onClick={() => archive(ex.id)} title="Archive (kept in history)">
                    ×
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
