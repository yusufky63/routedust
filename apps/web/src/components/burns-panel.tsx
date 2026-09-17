"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount } from "@testnet-router/core";
import { CCTP_DOMAINS, findChain } from "@testnet-router/registry";
import { Button, ExternalLink, Label, Module, Tag } from "./ui";
import { ChainIcon } from "./icons";
import { useDiscovery } from "@/hooks/use-discovery";
import { DEFAULT_LOOKBACK, executionForBurn, scanBurns, type BurnRecord, type BurnScanProgress } from "@/lib/burns";
import { chainShort, txUrl } from "@/lib/format";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

const STATUS_TONE: Record<BurnRecord["status"], "ok" | "warn" | "err" | "muted" | "accent"> = {
  MINTED: "ok",
  READY_TO_MINT: "accent",
  PENDING_ATTESTATION: "warn",
  FORWARDING: "warn",
  UNKNOWN: "muted",
};

const STATUS_LABEL: Record<BurnRecord["status"], string> = {
  MINTED: "MINTED",
  READY_TO_MINT: "READY TO MINT",
  PENDING_ATTESTATION: "ATTESTATION PENDING",
  FORWARDING: "CIRCLE FORWARDING",
  UNKNOWN: "UNKNOWN PAIR",
};

/**
 * Every CCTP burn the wallet made on any registry chain, read from the
 * chains themselves (not from local history), with what Circle and the
 * destination say about it. Unminted burns can be minted from here.
 */
export function BurnsPanel() {
  const { address } = useAccount();
  const watchAddress = useRouterStore((s) => s.watchAddress);
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const upsert = useRouterStore((s) => s.upsertExecution);
  const executions = useRouterStore((s) => s.executions);
  const discovery = useDiscovery();
  const router = useRouter();
  const wallet = address ?? watchAddress;
  const [burns, setBurns] = useState<BurnRecord[] | undefined>(undefined);
  const [progress, setProgress] = useState<Record<number, BurnScanProgress>>({});
  const [scanning, setScanning] = useState(false);
  const [depth, setDepth] = useState(1n);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const run = async (multiplier: bigint) => {
    if (!wallet) return;
    setScanning(true);
    setDepth(multiplier);
    setProgress({});
    try {
      const result = await scanBurns(wallet, getClients(rpcOverrides), discovery.data?.edges ?? [], DEFAULT_LOOKBACK * multiplier, (p) => setProgress((prev) => ({ ...prev, [p.chainId]: p })));
      setBurns(result);
    } finally {
      setScanning(false);
    }
  };

  const mint = (burn: BurnRecord) => {
    const existing = Object.values(executions).find((e) => e.edges[0]?.sourceTxHash?.toLowerCase() === burn.txHash.toLowerCase());
    if (existing) {
      router.push(`/route/${existing.id}`);
      return;
    }
    const ex = executionForBurn(burn);
    if (!ex) return;
    upsert(ex);
    router.push(`/route/${ex.id}`);
  };

  const list = (burns ?? []).filter((b) => !onlyOpen || b.status !== "MINTED");
  const states = Object.values(progress);
  const done = states.filter((s) => s.state === "done" || s.state === "error").length;

  return (
    <Module className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Circle USDC burns on-chain</Label>
          <p className="mt-1 text-xs text-muted">
            Read from the {CCTP_DOMAINS.length} CCTP chains directly, independent of local history: burns whose mint never happened show up here and can be minted, never burned again.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void run(1n)} disabled={!wallet || scanning}>
            {scanning ? `Scanning ${done}/${CCTP_DOMAINS.length}…` : burns ? "Rescan" : "Scan"}
          </Button>
          {burns ? (
            <Button onClick={() => void run(depth * 5n)} disabled={scanning} title="Look five times further back on every chain">
              Scan deeper
            </Button>
          ) : null}
          {burns ? (
            <button type="button" className={`btn !px-2.5 !py-1 ${onlyOpen ? "btn-active" : ""}`} onClick={() => setOnlyOpen(!onlyOpen)}>
              {onlyOpen ? "Unminted only" : "All burns"}
            </button>
          ) : null}
        </div>
      </div>
      {!wallet ? <p className="mono text-[11px] text-muted">Connect a wallet or watch an address to scan.</p> : null}
      {scanning ? (
        <div className="mono flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {states.map((s) => (
            <span key={s.chainId} className={s.state === "error" ? "text-error" : s.state === "done" ? "text-text" : ""}>
              {chainShort(s.chainId)} {s.state === "error" ? "error" : s.state === "done" ? `${s.found}` : "…"}
            </span>
          ))}
        </div>
      ) : null}
      {burns && list.length === 0 ? (
        <p className="mono text-[11px] text-muted">
          {onlyOpen ? "No unminted burns in the last" : "No burns in the last"} {(DEFAULT_LOOKBACK * depth).toString()} blocks per chain.
          {states.some((s) => s.state === "error") ? ` Some chains failed: ${states.filter((s) => s.state === "error").map((s) => `${chainShort(s.chainId)} (${s.error})`).join(", ")}.` : ""}
        </p>
      ) : null}
      {list.length > 0 ? (
        <div className="scroll-x">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="label text-left">
                <th className="py-2 pr-4 font-normal">Burn</th>
                <th className="py-2 pr-4 font-normal">Amount</th>
                <th className="py-2 pr-4 font-normal">Destination</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const dst = b.destinationChainId ? findChain(b.destinationChainId) : undefined;
                const existing = Object.values(executions).find((e) => e.edges[0]?.sourceTxHash?.toLowerCase() === b.txHash.toLowerCase());
                return (
                  <tr key={`${b.chainId}:${b.txHash}`} className="rule align-top">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.06em]">
                        <ChainIcon chainId={b.chainId} size={14} /> {chainShort(b.chainId)}
                      </div>
                      <div className="mono text-[11px] text-muted">
                        <ExternalLink href={txUrl(b.chainId, b.txHash)}>{b.txHash.slice(0, 12)}…</ExternalLink> · block {b.blockNumber.toString()}
                      </div>
                    </td>
                    <td className="num py-3 pr-4">{formatAmount(b.amount, 6)} USDC</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.06em]">
                        {dst ? <ChainIcon chainId={dst.id} size={14} /> : null} {dst?.shortName ?? `domain ${b.destinationDomain}`}
                        {b.forward ? <Tag tone="accent">FORWARD</Tag> : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Tag tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Tag>
                      {b.detail ? <div className="mono mt-1 max-w-xs text-[11px] text-muted">{b.detail.slice(0, 100)}</div> : null}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {existing ? (
                        <Link href={`/route/${existing.id}`} className="btn">
                          Open route
                        </Link>
                      ) : b.status === "READY_TO_MINT" || b.status === "PENDING_ATTESTATION" ? (
                        <Button variant="accent" onClick={() => mint(b)} disabled={!b.edge || !address}>
                          {b.status === "READY_TO_MINT" ? "Mint" : "Track & mint"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Module>
  );
}
