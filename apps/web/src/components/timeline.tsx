"use client";

import type { ExecutionStep } from "@testnet-router/core";
import { ExternalLink, Tag } from "./ui";
import { STEP_STATUS_TONE, chainShort, pad2, txUrl } from "@/lib/format";

export function Timeline({ steps }: { steps: ExecutionStep[] }) {
  if (steps.length === 0) return <div className="text-sm text-muted">No transactions built yet.</div>;
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li key={step.id} className="rule grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 py-3">
          <span className="mono text-xs text-muted">{pad2(i + 1)} /</span>
          <div className="flex flex-col gap-1">
            <span className="mono text-xs uppercase tracking-[0.06em]">
              {step.type.replace("_", " ")} · {step.label}
            </span>
            <span className="mono text-[11px] text-muted">
              {chainShort(step.chainId)}
              {step.txHash ? (
                <>
                  {" · "}
                  <ExternalLink href={txUrl(step.chainId, step.txHash)}>{step.txHash.slice(0, 10)}…</ExternalLink>
                </>
              ) : null}
              {step.type === "WAIT_ATTESTATION" && step.progress ? ` · ${step.progress}` : null}
            </span>
            {step.error ? (
              <span className="mono text-[11px] text-error">
                {step.error.code}: {step.error.message}
                {step.error.detail ? ` — ${step.error.detail.slice(0, 160)}` : ""}
              </span>
            ) : null}
          </div>
          <Tag tone={STEP_STATUS_TONE[step.status]}>{step.status}</Tag>
        </li>
      ))}
    </ol>
  );
}
