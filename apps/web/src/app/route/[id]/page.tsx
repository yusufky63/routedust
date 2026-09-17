"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount, formatSeconds, type Hex, type RouteExecution } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { findAnyAsset as findAsset } from "@/lib/assets";
import { ActionBar } from "@/components/action-bar";
import { AllowanceCleanup } from "@/components/allowance-cleanup";
import { RouteProvenance } from "@/components/provenance";
import { Timeline } from "@/components/timeline";
import { Button, Empty, ExternalLink, Label, Module, PageTitle, Rule, Tag, useMounted } from "@/components/ui";
import { ChainIcon } from "@/components/icons";
import { useExecutor } from "@/hooks/use-executor";
import { CANON_LABEL, EXEC_STATE_LABEL, addressUrl, chainName, edgeLabel, pad2 } from "@/lib/format";
import { useRouterStore } from "@/lib/store";

/** POSSIBLE_DUPLICATE: the user decides with the explorer open; both choices are persisted before Retry. */
function DuplicateResolver({ execution, stepId }: { execution: RouteExecution; stepId: string }) {
  const upsert = useRouterStore((s) => s.upsertExecution);
  const { address } = useAccount();
  const [hash, setHash] = useState("");
  const step = execution.steps.find((s) => s.id === stepId);
  if (!step || step.type === "WAIT_ATTESTATION" || step.type === "PERMIT") return null;
  const chain = findChain(step.chainId);
  const patch = (changes: Partial<typeof step>) => {
    upsert({ ...execution, error: undefined, state: "PLANNED", steps: execution.steps.map((s) => (s.id === stepId ? ({ ...s, ...changes } as typeof s) : s)) });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="label">Resolve before retrying</span>
      {address ? <ExternalLink href={addressUrl(step.chainId, address)}>wallet activity on {chain?.shortName}</ExternalLink> : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder="0x… hash of the transaction that was this step" className="w-full md:w-96" aria-label="Transaction hash" />
        <Button
          variant="accent"
          disabled={!/^0x[0-9a-fA-F]{64}$/.test(hash)}
          onClick={() => patch({ txHash: hash as Hex, status: "SUBMITTED", error: undefined })}
        >
          It was this step
        </Button>
        <Button onClick={() => patch({ nonce: undefined, startBlock: undefined, status: "PENDING", error: undefined })}>Unrelated, send again</Button>
      </div>
    </div>
  );
}

export default function RoutePage() {
  const mounted = useMounted();
  const params = useParams<{ id: string }>();
  const execution = useRouterStore((s) => s.executions[params.id]);
  const batches = useRouterStore((s) => s.batches);
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
  const back = execution.origin === "swap" ? { href: "/swap", label: "Swap" } : { href: "/", label: "Router" };
  const batchId = Object.values(batches).find((b) => b.executionIds.includes(execution.id))?.id;
  const canStart = !isRunning && !terminal;
  const stateTone = execution.state === "COMPLETED" ? "ok" : execution.state === "FAILED" ? "err" : execution.state === "PAUSED" ? "warn" : isRunning ? "accent" : "muted";
  const quoteExpired = c.edges.some((e) => e.quote.expiresAt <= Date.now());
  const signedSteps = execution.steps.filter((s) => s.status === "COMPLETED" || s.status === "CONFIRMED" || s.status === "SKIPPED").length;
  const failedStep = execution.steps.find((s) => s.status === "FAILED") ?? (execution.error?.code === "POSSIBLE_DUPLICATE" ? execution.steps.find((s) => s.status === "READY" || s.status === "PENDING") : undefined);
  const errorChainId = execution.error?.chainId ?? failedStep?.chainId ?? c.sourceChainId;
  const errorChain = findChain(errorChainId);
  const errorFaucets = (errorChain?.faucets ?? []).filter((f) => f.assetId === errorChain?.nativeAsset.canonicalAssetId || f.assetId === "*").slice(0, 3);
  const hint = (() => {
    switch (execution.error?.code) {
      case "USER_REJECTED":
        return "The wallet did not sign. Some wallets (Rabby) show an RPC error when their own RPC for this testnet fails: check the wallet's network RPC, then Retry. Completed steps are kept; a confirmed CCTP burn resumes at the destination mint.";
      case "WALLET_DISCONNECTED":
        return "The wallet disconnected. Nothing was lost on-chain: reconnect the same wallet and press Resume.";
      case "INSUFFICIENT_GAS":
        return `Top up ${errorChain?.nativeAsset.symbol ?? "gas"} on ${errorChain?.name ?? "the chain"} from a faucet, then Retry.`;
      case "WRONG_CHAIN":
        return `Switch the wallet to ${errorChain?.name ?? "the expected network"} and Retry.`;
      case "QUOTE_EXPIRED":
        return "Retry re-quotes the remaining steps before signing.";
      case "POSSIBLE_DUPLICATE":
        return `Nothing was sent again. A transaction left this wallet on ${errorChain?.name ?? "the chain"} after this step was handed to it. Check the wallet's activity or the explorer, then either paste that transaction's hash (the route continues from it) or mark it unrelated (the step is sent once more).`;
      case "SLIPPAGE_EXCEEDED":
        return "The pool moved more than the slippage tolerance allows. Retry re-quotes at the current price; raise the tolerance in Settings if it keeps happening.";
      case "SIMULATION_FAILED":
        return "The transaction would revert as built, so it was never sent. Retry rebuilds it with a fresh quote; if it persists the pool or bridge is unavailable right now.";
      default:
        return "Retry resumes from the first unfinished step; nothing already confirmed is sent again.";
    }
  })();

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
        {batchId ? (
          <Link href={`/batch/${batchId}`} className="btn btn-sm">
            Batch
          </Link>
        ) : null}
        <Link href="/activity" className="btn btn-sm">
          Activity
        </Link>
      </PageTitle>

      <Module className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div>
            <div className="display num text-3xl leading-none md:text-4xl">
              {formatAmount(c.amountIn, c.sourceAsset.decimals)} <span className="text-muted">{c.sourceAsset.symbol}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-label">
              <ChainIcon chainId={c.sourceChainId} size={14} /> {chainName(c.sourceChainId)}
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
            <div className="mt-2 flex items-center gap-2 text-xs uppercase tracking-label md:justify-end">
              <ChainIcon chainId={c.destination.chainId} size={14} /> {chainName(c.destination.chainId)}
            </div>
            {execution.recipient ? <div className="mono mt-1 text-xs text-warning md:text-right">to {execution.recipient}</div> : null}
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
                <span className="mono text-xs uppercase tracking-caps">
                  <span className="text-muted">{pad2(i + 1)} / </span>
                  {edgeLabel(e.type, e.provider)} <span className="text-muted">{e.healthNote}</span>
                </span>
                <span className="mono num text-xs text-muted">
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
        {execution.warnings && execution.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {execution.warnings.map((w, i) => (
              <li key={i} className="mono text-xs text-warning">
                warning: {w}
              </li>
            ))}
          </ul>
        ) : null}
        {execution.error ? (
          <div className="flex flex-col gap-1">
            <div className={`mono text-xs ${execution.state === "PAUSED" ? "text-warning" : "text-error"}`}>
              {execution.error.code}: {execution.error.message.split(" Request Arguments")[0]}
            </div>
            <div className="text-xs text-muted">{hint}</div>
            {execution.error.code === "POSSIBLE_DUPLICATE" && failedStep ? <DuplicateResolver execution={execution} stepId={failedStep.id} /> : null}
            {execution.error.code === "INSUFFICIENT_GAS" ? (
              <div className="mono flex flex-wrap gap-4 text-xs">
                {errorFaucets.map((f) => (
                  <ExternalLink key={f.id} href={f.url}>
                    {f.name}
                  </ExternalLink>
                ))}
                <ExternalLink href={`/faucets?chain=${errorChainId}`}>all faucets for {errorChain?.shortName}</ExternalLink>
              </div>
            ) : null}
          </div>
        ) : null}
        {err ? <div className="mono text-xs text-error">{err}</div> : null}
        <AllowanceCleanup execution={execution} />
      </Module>

      <ActionBar
        tone={terminal ? "done" : execution.state === "FAILED" || execution.state === "PAUSED" ? "warn" : "default"}
        status={
          terminal
            ? `Done · ${formatAmount(execution.edges[execution.edges.length - 1]?.amountOut ?? c.amountOut, dest?.decimals ?? 6)} ${dest?.symbol ?? ""} on ${chainName(c.destination.chainId)}`
            : isRunning
              ? `Running · ${signedSteps} of ${execution.steps.length || c.txCount} steps done`
              : execution.state === "FAILED"
                ? "Stopped. Retry picks up where it left off and re-quotes what expired."
                : execution.state === "PAUSED"
                  ? "Paused: nothing failed on-chain. Reconnect the wallet and resume."
                  : `${c.txCount} transaction${c.txCount === 1 ? "" : "s"} to sign, one at a time`
        }
        hint={terminal ? "The route is kept in Activity; history is archived, never deleted." : !address ? "Connect the wallet that owns this balance to sign." : undefined}
      >
        {terminal ? (
          <>
            <Link href="/activity" className="btn btn-lg">
              Activity
            </Link>
            {batchId ? (
              <Link href={`/batch/${batchId}`} className="btn btn-lg">
                ← Back to batch
              </Link>
            ) : null}
            <Link href={back.href} className="btn btn-lg btn-solid">
              ← Back to {back.label}
            </Link>
          </>
        ) : (
          <>
            <Link href={back.href} className="btn btn-lg">
              ← {back.label}
            </Link>
            {isRunning ? (
              <Button size="lg" onClick={cancel}>
                Cancel
              </Button>
            ) : null}
            {!isRunning ? (
              <Button variant="solid" size="lg" onClick={() => void start()} disabled={!address} title={address ? undefined : "Connect the wallet that owns this balance"}>
                {execution.state === "PLANNED" ? `Sign & start · ${c.txCount} tx` : execution.state === "FAILED" ? "Retry" : "Resume"}
              </Button>
            ) : null}
          </>
        )}
      </ActionBar>

      {execution.log.length > 0 ? (
        <details className="module">
          <summary className="label">Log ({execution.log.length})</summary>
          <pre className="mono mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted">{execution.log.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}
