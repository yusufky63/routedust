"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount, formatSeconds } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { RouteProvenance } from "@/components/provenance";
import { Timeline } from "@/components/timeline";
import { Button, Empty, Label, Marker, Module, PageTitle, Rule, Tag, useMounted } from "@/components/ui";
import { useExecutor } from "@/hooks/use-executor";
import { CANON_LABEL, EXEC_STATE_LABEL, chainName, edgeLabel, pad2 } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

export default function RoutePage() {
  const mounted = useMounted();
  const params = useParams<{ id: string }>();
  const execution = useRouterStore((s) => s.executions[params.id]);
  const { address } = useAccount();
  const { run, cancel, running } = useExecutor();
  const [showWhy, setShowWhy] = useState(false);
  const [err, setErr] = useState<string | undefined>(undefined);

  if (!mounted) return null;
  if (!execution) return <Empty title="Route not found" hint="Executions are stored locally in this browser." action={{ href: "/activity", label: "Activity" }} />;

  const c = execution.candidate;
  const dest = findAsset(c.destination.assetId);
  const srcChain = findChain(c.sourceChainId);
  const dstChain = findChain(c.destination.chainId);
  const isRunning = running === execution.id;
  const terminal = execution.state === "COMPLETED";
  const canStart = !isRunning && !terminal && Boolean(address);
  const stateTone = execution.state === "COMPLETED" ? "ok" : execution.state === "FAILED" ? "err" : isRunning ? "accent" : "muted";
  const quoteExpired = c.edges.some((e) => e.quote.expiresAt <= Date.now());

  const start = async () => {
    setErr(undefined);
    try {
      await run(execution);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={`Route ${execution.id.slice(-6).toUpperCase()}`} meta={<Tag tone={stateTone}>{EXEC_STATE_LABEL[execution.state]}</Tag>}>
        {canStart ? (
          <Button variant="solid" onClick={() => void start()}>
            {execution.state === "PLANNED" ? "Sign & start" : execution.state === "FAILED" ? "Retry" : "Resume"}
          </Button>
        ) : null}
        {isRunning ? <Button onClick={cancel}>Cancel</Button> : null}
      </PageTitle>

      <Module className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div>
            <div className="display num text-3xl leading-none md:text-4xl">
              {formatAmount(c.amountIn, c.sourceAsset.decimals)} <span className="text-muted">{c.sourceAsset.symbol}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em]">
              <Marker color={srcChain?.color} /> {chainName(c.sourceChainId)}
            </div>
          </div>
          <div className="mono hidden text-muted md:block" aria-hidden>
            ──────→
          </div>
          <div className="md:text-right">
            <div className="display num text-3xl leading-none md:text-4xl">
              {formatAmount(execution.edges[execution.edges.length - 1]?.amountOut ?? c.amountOut, dest?.decimals ?? 6)}{" "}
              <span className="text-muted">{dest?.symbol}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] md:justify-end">
              <Marker color={dstChain?.color} /> {chainName(c.destination.chainId)}
            </div>
          </div>
        </div>
        <Rule />
        <div className="flex flex-wrap gap-1">
          <Tag>{c.txCount} TX</Tag>
          <Tag tone="accent">{CANON_LABEL[c.outputCanonicality]}</Tag>
          <Tag>{formatSeconds(c.estimatedSeconds)}</Tag>
          {quoteExpired && !terminal ? <Tag tone="warn">QUOTE EXPIRED · WILL RE-QUOTE</Tag> : null}
          {!address ? <Tag tone="err">WALLET DISCONNECTED</Tag> : null}
        </div>
        <ol className="flex flex-col">
          {c.edges.map((e, i) => {
            const p = execution.edges[i];
            return (
              <li key={e.id} className="rule flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="mono text-xs uppercase tracking-[0.06em]">
                  <span className="text-muted">{pad2(i + 1)} / </span>
                  {edgeLabel(e.type, e.provider)} <span className="text-muted">{e.healthNote}</span>
                </span>
                <span className="mono num text-[11px] text-muted">
                  {p?.amountOut !== undefined
                    ? `out ${formatAmount(p.amountOut, findAsset(e.to.assetId)?.decimals ?? 18)} ${findAsset(e.to.assetId)?.symbol}`
                    : `quoted ${formatAmount(e.quote.amountOut, findAsset(e.to.assetId)?.decimals ?? 18)} ${findAsset(e.to.assetId)?.symbol}`}
                  {p?.done ? " · done" : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2">
          <Button active={showWhy} onClick={() => setShowWhy(!showWhy)}>
            Why this route?
          </Button>
        </div>
        {showWhy ? (
          <>
            <Rule />
            <RouteProvenance candidate={c} />
          </>
        ) : null}
      </Module>

      <Module className="flex flex-col gap-3">
        <Label>Transaction timeline</Label>
        <Timeline steps={execution.steps} />
        {execution.error ? (
          <div className="mono text-xs text-error">
            {execution.error.code}: {execution.error.message}
          </div>
        ) : null}
        {err ? <div className="mono text-xs text-error">{err}</div> : null}
      </Module>

      {execution.log.length > 0 ? (
        <details className="module">
          <summary className="label">Log ({execution.log.length})</summary>
          <pre className="mono mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{execution.log.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}
