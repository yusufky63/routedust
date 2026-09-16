"use client";

import Link from "next/link";
import { formatAmount } from "@testnet-router/core";
import { findAsset } from "@testnet-router/registry";
import { Button, Empty, Marker, PageTitle, Tag, useMounted } from "@/components/ui";
import { EXEC_STATE_LABEL, chainName, edgeLabel, timeAgo } from "@/lib/format";
import { useRouterStore } from "@/lib/store";
import { findChain } from "@testnet-router/registry";

export default function ActivityPage() {
  const mounted = useMounted();
  const executions = useRouterStore((s) => s.executions);
  const remove = useRouterStore((s) => s.removeExecution);
  if (!mounted) return null;
  const list = Object.values(executions).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div>
      <PageTitle title="Activity" meta="Cross-chain execution history · stored locally in this browser" />
      {list.length === 0 ? <Empty title="No executions yet" action={{ href: "/", label: "Plan a route" }} /> : null}
      <div className="flex flex-col">
        {list.map((ex) => {
          const c = ex.candidate;
          const dest = findAsset(c.destination.assetId);
          const tone = ex.state === "COMPLETED" ? "ok" : ex.state === "FAILED" ? "err" : "warn";
          return (
            <div key={ex.id} className="rule flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
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
