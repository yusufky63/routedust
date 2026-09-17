"use client";

import { useCallback, useRef, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { RouteExecutor, createExecution, type Address, type CodePinStore, type Hex, type RouteCandidate, type RouteExecution } from "@testnet-router/core";
import { KNOWN_CODE_HASHES } from "@testnet-router/registry";
import { currentAssets } from "@/lib/assets";
import { getClients, providers } from "@/lib/router";
import { notify } from "@/lib/notify";
import { createWagmiSigner } from "@/lib/signer";
import { useRouterStore } from "@/lib/store";

const lastNotified = new Map<string, string>();

/** Background-tab notifications on the transitions a user waits for. */
function notifyTransition(ex: RouteExecution, enabled: boolean): void {
  if (!enabled) return;
  const key = `${ex.state}:${ex.error?.code ?? ""}`;
  if (lastNotified.get(ex.id) === key) return;
  lastNotified.set(ex.id, key);
  const src = ex.candidate.sourceAsset.symbol;
  if (ex.state === "DESTINATION_EXECUTING") notify("Dustline: attestation ready", `${src} route: the destination mint is ready to sign.`, ex.id);
  else if (ex.state === "COMPLETED") notify("Dustline: route completed", `${src} arrived on the destination chain.`, ex.id);
  else if (ex.state === "PAUSED") notify("Dustline: route paused", `${src} route paused (wallet disconnected). Reconnect and resume.`, ex.id);
  else if (ex.state === "FAILED") notify("Dustline: route needs attention", `${src} route stopped: ${ex.error?.code ?? "error"}.`, ex.id);
}

/** Registry hashes first (verified at snapshot), then whatever this browser pinned on first use. */
const codePins: CodePinStore = {
  get(chainId: number, address: Address) {
    const key = `${chainId}:${address.toLowerCase()}`;
    return (KNOWN_CODE_HASHES[key] ?? useRouterStore.getState().codePins[key]) as Hex | undefined;
  },
  set(chainId: number, address: Address, hash: Hex) {
    useRouterStore.getState().pinCode(`${chainId}:${address.toLowerCase()}`, hash);
  },
};

export function useExecutor() {
  const config = useConfig();
  const { address } = useAccount();
  const upsert = useRouterStore((s) => s.upsertExecution);
  const settings = useRouterStore((s) => s.settings);
  const [running, setRunning] = useState<string | undefined>(undefined);
  const runningRef = useRef<string | undefined>(undefined);
  const executor = useRef<RouteExecutor | undefined>(undefined);
  const cancelled = useRef(false);

  const create = useCallback(
    (candidate: RouteCandidate, options: { amountMode?: "fixed" | "balance"; amountCap?: bigint; groupId?: string } = {}): RouteExecution => {
      const ex: RouteExecution = { ...createExecution(candidate), ...options };
      upsert(ex);
      return ex;
    },
    [upsert],
  );

  const runOne = useCallback(
    async (execution: RouteExecution) => {
      if (!address) throw new Error("Connect a wallet first");
      runningRef.current = execution.id;
      setRunning(execution.id);
      const ex = new RouteExecutor({
        providers,
        clients: getClients(settings.rpcOverrides),
        assets: currentAssets(),
        signer: createWagmiSigner(config, address),
        simulate: settings.simulateBeforeSign,
        onUpdate: (updated) => {
          upsert(updated);
          notifyTransition(updated, settings.notifications);
        },
        codePins,
        gasSafetyMultiplier: settings.gasSafetyMultiplier,
      });
      executor.current = ex;
      try {
        // A running execution is resumed from its persisted steps, never restarted.
        const fresh: RouteExecution = {
          ...execution,
          error: undefined,
          warnings: [],
          state: execution.state === "FAILED" || execution.state === "PAUSED" ? "PLANNED" : execution.state,
        };
        return await ex.run(fresh);
      } finally {
        runningRef.current = undefined;
        setRunning(undefined);
        executor.current = undefined;
      }
    },
    [address, config, settings.rpcOverrides, settings.simulateBeforeSign, settings.notifications, settings.gasSafetyMultiplier, upsert],
  );

  const run = useCallback(
    async (execution: RouteExecution) => {
      if (runningRef.current) return undefined;
      cancelled.current = false;
      return runOne(execution);
    },
    [runOne],
  );

  /** Runs executions one after another; a failure does not stop the others. */
  const runMany = useCallback(
    async (ids: string[], onEach?: (execution: RouteExecution) => void) => {
      if (runningRef.current) return;
      cancelled.current = false;
      for (const id of ids) {
        if (cancelled.current) break;
        const latest = useRouterStore.getState().executions[id];
        if (!latest || latest.state === "COMPLETED") continue;
        const result = await runOne(latest);
        onEach?.(result);
      }
    },
    [runOne],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    executor.current?.cancel();
  }, []);

  return { create, run, runMany, cancel, running };
}
