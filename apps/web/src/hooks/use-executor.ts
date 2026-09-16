"use client";

import { useCallback, useRef, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { RouteExecutor, createExecution, type RouteCandidate, type RouteExecution } from "@testnet-router/core";
import { ASSETS } from "@testnet-router/registry";
import { getClients, providers } from "@/lib/router";
import { createWagmiSigner } from "@/lib/signer";
import { useRouterStore } from "@/lib/store";

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
    (candidate: RouteCandidate): RouteExecution => {
      const ex = createExecution(candidate);
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
        assets: ASSETS,
        signer: createWagmiSigner(config, address),
        simulate: settings.simulateBeforeSign,
        onUpdate: upsert,
      });
      executor.current = ex;
      try {
        // A running execution is resumed from its persisted steps, never restarted.
        const fresh: RouteExecution = { ...execution, error: undefined, state: execution.state === "FAILED" ? "PLANNED" : execution.state };
        return await ex.run(fresh);
      } finally {
        runningRef.current = undefined;
        setRunning(undefined);
        executor.current = undefined;
      }
    },
    [address, config, settings.rpcOverrides, settings.simulateBeforeSign, upsert],
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
