"use client";

import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { parseEther, type Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { findChain } from "@testnet-router/registry";
import { ChainIcon } from "./icons";
import { Button, ExternalLink, Label, LinkAction, Module, Select, Tag } from "./ui";
import { txUrl } from "@/lib/format";
import { useRouterStore, type TrackedWithdrawal } from "@/lib/store";
import {
  WITHDRAWAL_STATUS_LABEL,
  finalizeWithdrawal,
  formatEth,
  formatWait,
  proveWithdrawal,
  startWithdrawal,
  withdrawalChains,
  withdrawalProgress,
  type WithdrawalStatus,
} from "@/lib/op-withdrawals";

const SEPOLIA = 11155111;

function tone(status: WithdrawalStatus | undefined) {
  if (status === "finalized") return "ok" as const;
  if (status === "ready-to-prove" || status === "ready-to-finalize") return "accent" as const;
  return "muted" as const;
}

/**
 * Rollup withdrawals take days, so they live outside the route executor: the
 * portal is asked what state each one is in, and the two Ethereum Sepolia
 * transactions (prove, then finalise) are signed when they are due.
 */
export function WithdrawalsPanel() {
  const config = useConfig();
  const { address } = useAccount();
  const tracked = useRouterStore((s) => s.withdrawals);
  const trackWithdrawal = useRouterStore((s) => s.trackWithdrawal);
  const forgetWithdrawal = useRouterStore((s) => s.forgetWithdrawal);
  const chains = withdrawalChains();
  const items = Object.values(tracked).sort((a, b) => b.startedAt - a.startedAt);

  const [chainId, setChainId] = useState<number>(chains[0]?.id ?? SEPOLIA);
  const [amount, setAmount] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const progress = useQueries({
    queries: items.map((w) => ({
      queryKey: ["withdrawal", w.key],
      queryFn: () => withdrawalProgress(w.l2ChainId, w.l2TxHash),
      refetchInterval: 60_000,
      staleTime: 30_000,
      retry: false,
    })),
  });

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]?.slice(0, 200) : String(err));
    } finally {
      setBusy(undefined);
    }
  };

  const start = () =>
    run("start", async () => {
      if (!address) throw new Error("Connect the wallet that holds the balance");
      const wei = parseEther(amount.trim() || "0");
      if (wei <= 0n) throw new Error("Enter an amount");
      const txHash = await startWithdrawal(config, chainId, wei, address);
      trackWithdrawal({ key: `${chainId}:${txHash}`, l2ChainId: chainId, l2TxHash: txHash, amount: wei, startedAt: Date.now() });
      setAmount("");
    });

  const track = () =>
    run("track", async () => {
      const txHash = hash.trim() as Hex;
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Paste the L2 transaction hash of the withdrawal");
      // Reject anything that is not a withdrawal before it is stored.
      const state = await withdrawalProgress(chainId, txHash);
      trackWithdrawal({ key: `${chainId}:${txHash}`, l2ChainId: chainId, l2TxHash: txHash, amount: state.amount, startedAt: Date.now() });
      setHash("");
    });

  if (items.length === 0 && !open) {
    return (
      <Module className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label>Rollup withdrawals</Label>
          <p className="text-sm text-muted">
            Leaving a rollup for Ethereum Sepolia takes about seven days and two transactions here at the end. Nothing is in flight right now.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Start or track a withdrawal</Button>
      </Module>
    );
  }

  return (
    <Module className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <Label>Rollup withdrawals</Label>
        <span className="meta">start on the rollup · prove on Sepolia (up to ~2 h later) · finalise after ~7 days</span>
      </header>

      {items.length > 0 ? (
        <div className="flex flex-col divide-y divide-border">
          {items.map((w: TrackedWithdrawal, i) => {
            const q = progress[i];
            const state = q?.data;
            const chain = findChain(w.l2ChainId);
            const ready = state?.status === "ready-to-prove" || state?.status === "ready-to-finalize";
            return (
              <div key={w.key} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <ChainIcon chainId={w.l2ChainId} size={14} />
                    <span className="num">{formatEth(state?.amount ?? w.amount ?? 0n)}</span>
                    <span className="text-muted">
                      {chain?.shortName ?? w.l2ChainId} → Ethereum Sepolia
                    </span>
                    <Tag tone={tone(state?.status)}>{state ? WITHDRAWAL_STATUS_LABEL[state.status] : q?.isError ? "UNREADABLE" : "CHECKING"}</Tag>
                  </span>
                  <span className="meta flex flex-wrap items-center gap-x-3">
                    <ExternalLink href={txUrl(w.l2ChainId, w.l2TxHash)}>{w.l2TxHash.slice(0, 10)}…</ExternalLink>
                    {state?.secondsUntilReady ? <span>ready in {formatWait(state.secondsUntilReady)}</span> : null}
                    {q?.isError ? <span className="text-error">{(q.error as Error).message.split("\n")[0]?.slice(0, 90)}</span> : null}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                  {state?.status === "ready-to-prove" ? (
                    <Button variant="solid" disabled={!address || busy === w.key} onClick={() => void run(w.key, () => proveWithdrawal(config, w.l2ChainId, w.l2TxHash))}>
                      {busy === w.key ? "Proving…" : "Prove on Sepolia"}
                    </Button>
                  ) : null}
                  {state?.status === "ready-to-finalize" ? (
                    <Button variant="solid" disabled={!address || busy === w.key} onClick={() => void run(w.key, () => finalizeWithdrawal(config, w.l2ChainId, w.l2TxHash))}>
                      {busy === w.key ? "Finalising…" : "Finalise and receive"}
                    </Button>
                  ) : null}
                  {!ready ? (
                    <Button disabled={q?.isFetching} onClick={() => void q?.refetch()}>
                      {q?.isFetching ? "Checking…" : "Check"}
                    </Button>
                  ) : null}
                  <LinkAction onClick={() => forgetWithdrawal(w.key)} title="Stop tracking it here; the withdrawal itself is unaffected">
                    Remove
                  </LinkAction>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="module-raised grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr_auto] md:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="label">Rollup</span>
          <Select
            ariaLabel="Rollup to withdraw from"
            value={chainId}
            onChange={setChainId}
            options={chains.map((c) => ({ value: c.id, label: findChain(c.id)?.name ?? c.name, icon: <ChainIcon chainId={c.id} size={16} /> }))}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="label">Amount (ETH)</span>
          <input className="num w-full" placeholder="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <Button variant="accent" disabled={!address || busy === "start"} onClick={() => void start()} title={address ? undefined : "Connect a wallet"}>
          {busy === "start" ? "Starting…" : "Start withdrawal"}
        </Button>
        <label className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
          <span className="label">Already started elsewhere? Track it by its transaction on the rollup</span>
          <input className="mono w-full" placeholder="0x… L2 transaction hash" value={hash} onChange={(e) => setHash(e.target.value.trim())} spellCheck={false} autoComplete="off" />
        </label>
        <Button disabled={busy === "track"} onClick={() => void track()}>
          {busy === "track" ? "Checking…" : "Track it"}
        </Button>
      </div>

      {error ? <p className="mono text-xs text-error">{error}</p> : null}
      <p className="meta">
        The ETH stays yours the whole time: until it is finalised it sits in the rollup&apos;s portal on Sepolia, and only your wallet can claim it.
      </p>
    </Module>
  );
}
