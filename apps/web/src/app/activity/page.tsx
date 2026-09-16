"use client";

import Link from "next/link";
import { formatAmount } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { Button, Empty, Label, Marker, PageTitle, Tag, useMounted } from "@/components/ui";
import { EXEC_STATE_LABEL, chainName, edgeLabel, pad2, timeAgo } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

export default function ActivityPage() {
  const mounted = useMounted();
  const executions = useRouterStore((s) => s.executions);
  const batches = useRouterStore((s) => s.batches);
  const remove = useRouterStore((s) => s.removeExecution);
  const removeBatch = useRouterStore((s) => s.removeBatch);
  if (!mounted) return null;
  const list = Object.values(executions).sort((a, b) => b.updatedAt - a.updatedAt);
  const batchList = Object.values(batches).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <PageTitle title="Activity" meta="Cross-chain execution history · stored locally in this browser" />
      {list.length === 0 && batchList.length === 0 ? <Empty title="No executions yet" action={{ href: "/", label: "Plan a route" }} /> : null}

      {batchList.length > 0 ? (
        <section className="mb-8">
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
                    <Button onClick={() => removeBatch(b.id)} title="Remove batch (executions are kept)">
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
      <div className="flex flex-col">
        {list.map((ex) => {
          const c = ex.candidate;
          const dest = findAsset(c.destination.assetId);
          const tone = ex.state === "COMPLETED" ? "ok" : ex.state === "FAILED" ? "err" : "warn";
          return (
            <div key={ex.id} className="flex flex-col gap-2 border-t border-border py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <div className="display num text-lg">
                  {formatAmount(c.amountIn, c.sourceAsset.decimals)} {c.sourceAsset.symbol} <span className="text-muted">→</span>{" "}
                  {formatAmount(c.amountOut, dest?.decimals ?? 6)} {dest?.symbol}
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.06em]">
                  <Marker color={findChain(c.sourceChainId)?.color} /> {chainName(c.sourceChainId)} <span className="text-muted">→</span>
                  <Marker color={findChain(c.destination.chainId)?.color} /> {chainName(c.destination.chainId)}
                </div>
                <div className="mono text-[11px] text-muted">
                  {c.edges.map((e) => edgeLabel(e.type, e.provider)).join(" → ")} · {timeAgo(ex.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tag tone={tone}>{EXEC_STATE_LABEL[ex.state]}</Tag>
                <Link href={`/route/${ex.id}`} className="btn">
                  Open
                </Link>
                {ex.state === "COMPLETED" || ex.state === "FAILED" || ex.state === "PLANNED" ? (
                  <Button onClick={() => remove(ex.id)} title="Remove from history">
                    ×
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
