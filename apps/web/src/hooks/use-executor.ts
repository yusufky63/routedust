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
  const executor = useRef<RouteExecutor | undefined>(undefined);

  const create = useCallback(
    (candidate: RouteCandidate): RouteExecution => {
      const ex = createExecution(candidate);
      upsert(ex);
      return ex;
    },
    [upsert],
  );

  const run = useCallback(
    async (execution: RouteExecution) => {
      if (!address) throw new Error("Connect a wallet first");
      if (running) return;
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
        // Guard against double execution after a refresh: a running execution is
        // resumed from its persisted steps, never restarted from scratch.
        const fresh: RouteExecution = { ...execution, error: undefined, state: execution.state === "FAILED" ? "PLANNED" : execution.state };
        await ex.run(fresh);
      } finally {
        setRunning(undefined);
        executor.current = undefined;
      }
    },
    [address, config, running, settings.rpcOverrides, settings.simulateBeforeSign, upsert],
  );

  const cancel = useCallback(() => executor.current?.cancel(), []);

  return { create, run, cancel, running };
}
