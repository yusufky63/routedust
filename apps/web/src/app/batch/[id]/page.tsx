"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount, type RouteExecution } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { ActionBar } from "@/components/action-bar";
import { Button, Empty, Label, Module, PageTitle, Tag, useMounted } from "@/components/ui";
import { ChainIcon } from "@/components/icons";
import { useExecutor } from "@/hooks/use-executor";
import { EXEC_STATE_LABEL, chainName, edgeLabel, pad2 } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

function stateTone(ex: RouteExecution, runningId?: string) {
  if (ex.state === "COMPLETED") return "ok" as const;
  if (ex.state === "FAILED") return "err" as const;
  if (ex.state === "PAUSED") return "warn" as const;
  if (runningId === ex.id) return "accent" as const;
  return "muted" as const;
}

export default function BatchPage() {
  const mounted = useMounted();
  const params = useParams<{ id: string }>();
  const batch = useRouterStore((s) => s.batches[params.id]);
  const executions = useRouterStore((s) => s.executions);
  const { address } = useAccount();
  const { runMany, cancel, running } = useExecutor();
  const [err, setErr] = useState<string | undefined>(undefined);

  if (!mounted) return null;
  if (!batch) return <Empty title="Batch not found" hint="Batches are stored locally in this browser." action={{ href: "/activity", label: "Activity" }} />;

  const items = batch.executionIds.map((id) => executions[id]).filter((e): e is RouteExecution => Boolean(e));
  const completed = items.filter((e) => e.state === "COMPLETED").length;
  const failed = items.filter((e) => e.state === "FAILED").length;
  const pending = items.filter((e) => e.state !== "COMPLETED");
  const isRunning = Boolean(running && batch.executionIds.includes(running));
  const dest = items[0] ? findAsset(items[0].candidate.destination.assetId) : undefined;
  // Gateway deposit legs only fund the pooled transfer; what arrives is the collector's output.
  const isDepositLeg = (e: RouteExecution) => (e.candidate.edges[0]?.meta as { role?: string } | undefined)?.role === "deposit";
  const totalOut = items.filter((e) => !isDepositLeg(e)).reduce((acc, e) => acc + (e.edges[e.edges.length - 1]?.amountOut ?? e.candidate.amountOut), 0n);

  const start = async () => {
    setErr(undefined);
    try {
      await runMany(pending.map((e) => e.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={`Batch ${batch.id.slice(-4).toUpperCase()}`}
        meta={
          <span className="flex items-center gap-2">
            <Tag tone={failed ? "err" : completed === items.length ? "ok" : isRunning ? "accent" : "muted"}>
              {completed}/{items.length} COMPLETED{failed ? ` · ${failed} FAILED` : ""}
            </Tag>
            <span>{batch.label}</span>
          </span>
        }
      >
        <Link href="/activity" className="btn btn-sm">
          Activity
        </Link>
      </PageTitle>

      <Module className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Label>Routes run one after another · each transaction is signed in your wallet</Label>
          <span className="display num text-xl">
            <span className="label mr-2">total</span>
            {formatAmount(totalOut, dest?.decimals ?? 6)} <span className="text-sm text-muted">{dest?.symbol}</span>
          </span>
        </div>
        {!address ? <p className="mono text-xs text-error">Wallet disconnected: connect the wallet that owns these balances to run the batch.</p> : null}
        {err ? <p className="mono text-xs text-error">{err}</p> : null}
        <ol className="mt-2 flex flex-col">
          {items.map((ex, i) => {
            const c = ex.candidate;
            const d = findAsset(c.destination.assetId);
            const active = running === ex.id;
            const currentStep = ex.steps.find((s) => s.status !== "COMPLETED" && s.status !== "CONFIRMED" && s.status !== "SKIPPED");
            return (
              <li key={ex.id} className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-t border-border py-4 ${active ? "bg-raised" : ""}`}>
                <span className="mono text-xs text-muted">{pad2(i + 1)} /</span>
                <div className="flex flex-col gap-1">
                  <div className="display num text-lg">
                    {ex.amountMode === "balance" && !ex.edges[0]?.sourceTxHash ? "≈ " : ""}
                    {formatAmount(c.amountIn, c.sourceAsset.decimals)} {c.sourceAsset.symbol} <span className="text-muted">→</span>{" "}
                    {isDepositLeg(ex) ? <span className="text-muted">Gateway balance</span> : `${formatAmount(ex.edges[ex.edges.length - 1]?.amountOut ?? c.amountOut, d?.decimals ?? 6)} ${d?.symbol ?? ""}`}
                    {ex.amountMode === "balance" ? <span className="ml-2 text-xs text-muted">pooled balance at run time</span> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-caps">
                    <ChainIcon chainId={c.sourceChainId} size={14} /> {chainName(c.sourceChainId)}
                    <span className="mono normal-case tracking-normal text-muted">{c.edges.map((e) => edgeLabel(e.type, e.provider)).join(" → ")}</span>
                  </div>
                  {active && currentStep ? (
                    <div className="mono text-xs text-accent">
                      {currentStep.label} · {currentStep.status}
                      {currentStep.type === "WAIT_ATTESTATION" && currentStep.progress ? ` · ${currentStep.progress}` : ""}
                    </div>
                  ) : null}
                  {ex.error ? (
                    <div className="mono text-xs text-error">
                      {ex.error.code}: {ex.error.message}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone={stateTone(ex, running)}>{EXEC_STATE_LABEL[ex.state]}</Tag>
                  <Link href={`/route/${ex.id}`} className="btn">
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </Module>

      <ActionBar
        tone={failed ? "warn" : pending.length === 0 ? "done" : "default"}
        status={
          pending.length === 0
            ? `Batch done · ${formatAmount(totalOut, dest?.decimals ?? 6)} ${dest?.symbol ?? ""} received`
            : isRunning
              ? `Running · ${completed} of ${items.length} routes done`
              : failed
                ? `${failed} route${failed === 1 ? "" : "s"} stopped · resuming re-quotes what expired`
                : `${pending.length} route${pending.length === 1 ? "" : "s"} to run, one after another`
        }
        hint={pending.length === 0 ? "Every route stays in Activity." : !address ? "Connect the wallet that owns these balances." : "Each transaction is signed in your wallet."}
      >
        <Link href="/activity" className="btn btn-lg">
          Activity
        </Link>
        <Link href="/" className={`btn btn-lg ${pending.length === 0 ? "btn-solid" : ""}`}>
          ← Back to Router
        </Link>
        {isRunning ? (
          <Button size="lg" onClick={cancel}>
            Stop after current
          </Button>
        ) : null}
        {pending.length > 0 && !isRunning ? (
          <Button variant="solid" size="lg" onClick={() => void start()} disabled={!address}>
            {completed > 0 || failed > 0 ? "Resume batch" : `Sign & start · ${items.length} routes`}
          </Button>
        ) : null}
      </ActionBar>
    </div>
  );
}
