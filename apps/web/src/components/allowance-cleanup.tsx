"use client";

import { useEffect, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { decodeFunctionData, encodeFunctionData, erc20Abi, type Address } from "viem";
import type { RouteExecution } from "@testnet-router/core";
import { findChain } from "@testnet-router/registry";
import { Button } from "./ui";
import { findAnyAsset } from "@/lib/assets";
import { getClients } from "@/lib/router";
import { createWagmiSigner } from "@/lib/signer";
import { useRouterStore } from "@/lib/store";

interface Leftover {
  chainId: number;
  token: Address;
  spender: Address;
  symbol: string;
  allowance: bigint;
}

/**
 * After a route completes, any allowance a spender still holds is surfaced
 * with a one-click revoke (approve 0). Approvals are exact, so a leftover
 * normally means a step was re-quoted for a smaller amount.
 */
export function AllowanceCleanup({ execution }: { execution: RouteExecution }) {
  const { address } = useAccount();
  const config = useConfig();
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const [leftovers, setLeftovers] = useState<Leftover[]>([]);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (execution.state !== "COMPLETED" || !address) return;
    let cancelled = false;
    const approvals = execution.steps.filter((s) => s.type === "APPROVE");
    (async () => {
      const found: Leftover[] = [];
      for (const step of approvals) {
        if (step.type !== "APPROVE") continue;
        try {
          const decoded = decodeFunctionData({ abi: erc20Abi, data: step.tx.data });
          if (decoded.functionName !== "approve") continue;
          const [spender] = decoded.args as readonly [Address, bigint];
          const client = getClients(rpcOverrides).get(step.chainId);
          const allowance = await client.readContract({ address: step.tx.to, abi: erc20Abi, functionName: "allowance", args: [address, spender] });
          if (allowance > 0n) {
            const asset = findAnyAsset(`${step.chainId}:${step.tx.to.toLowerCase()}`);
            found.push({ chainId: step.chainId, token: step.tx.to, spender, symbol: asset?.symbol ?? "token", allowance });
          }
        } catch {
          // unreadable allowance: nothing to offer
        }
      }
      if (!cancelled) setLeftovers(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [execution.state, execution.steps, address, rpcOverrides]);

  if (leftovers.length === 0) return null;

  const revoke = async (l: Leftover) => {
    if (!address) return;
    setBusy(`${l.chainId}:${l.token}:${l.spender}`);
    setError(undefined);
    try {
      const signer = createWagmiSigner(config, address);
      const current = await signer.getChainId();
      if (current !== l.chainId) await signer.switchChain(l.chainId);
      const hash = await signer.sendTransaction({
        chainId: l.chainId,
        to: l.token,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [l.spender, 0n] }),
      });
      await getClients(rpcOverrides).get(l.chainId).waitForTransactionReceipt({ hash });
      setLeftovers((prev) => prev.filter((x) => x !== l));
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : String(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="label">Leftover allowances</span>
      {leftovers.map((l) => (
        <div key={`${l.chainId}:${l.token}:${l.spender}`} className="flex flex-wrap items-center justify-between gap-2">
          <span className="mono text-xs text-muted">
            {l.symbol} on {findChain(l.chainId)?.shortName}: spender {l.spender.slice(0, 10)}… still allowed {l.allowance.toString()} units
          </span>
          <Button onClick={() => void revoke(l)} disabled={busy !== undefined}>
            {busy === `${l.chainId}:${l.token}:${l.spender}` ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      ))}
      {error ? <span className="mono text-xs text-error">{error}</span> : null}
    </div>
  );
}
