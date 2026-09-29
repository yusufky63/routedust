"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { create as createStore } from "zustand";
import { RouteExecutor, createExecution, type Address, type CodePinStore, type Hex, type RouteCandidate, type RouteExecution } from "@testnet-router/core";
import { KNOWN_CODE_HASHES } from "@testnet-router/registry";
import { currentAssets } from "@/lib/assets";
import { getClients, providers } from "@/lib/router";
import { notify } from "@/lib/notify";
import { createWagmiSigner } from "@/lib/signer";
import { readRecord } from "@/lib/record-storage";
import { useRouterStore } from "@/lib/store";

const lastNotified = new Map<string, string>();

/** Background-tab notifications on the transitions a user waits for. */
function notifyTransition(ex: RouteExecution, enabled: boolean): void {
  if (!enabled) return;
  const key = `${ex.state}:${ex.error?.code ?? ""}`;
  if (lastNotified.get(ex.id) === key) return;
  lastNotified.set(ex.id, key);
  const src = ex.candidate.sourceAsset.symbol;
  if (ex.state === "DESTINATION_EXECUTING") notify("RouteDust: attestation ready", `${src} route: the destination mint is ready to sign.`, ex.id);
  else if (ex.state === "COMPLETED") notify("RouteDust: route completed", `${src} arrived on the destination chain.`, ex.id);
  else if (ex.state === "PAUSED") notify("RouteDust: route paused", `${src} route paused (wallet disconnected). Reconnect and resume.`, ex.id);
  else if (ex.state === "FAILED") notify("RouteDust: route needs attention", `${src} route stopped: ${ex.error?.code ?? "error"}.`, ex.id);
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

/**
 * What runs right now lives at module level, not in a component: leaving the
 * route page and coming back must show the run still going, and must never
 * let "Resume" start a second executor for a step whose wallet prompt is still
 * open (that is how a burn gets signed twice). Across tabs of this browser the
 * same guarantee comes from a Web Lock per execution id.
 */
const executors = new Map<string, RouteExecutor>();
/** Started but still waiting for their Web Lock (a double click must not look like "another tab"). */
const starting = new Set<string>();
/** Executions whose latest snapshot could not be saved: nothing more is signed for them. */
const unsaved = new Set<string>();
const STORAGE_FULL =
  "This browser's storage is full, so the route could not save the step it is about to sign; nothing was sent. Free space (clear old site data for this app), then Retry.";
const useRunning = createStore<{ ids: string[] }>(() => ({ ids: [] }));
let batchCancelled = false;

function setRunning(id: string, on: boolean): void {
  useRunning.setState((s) => ({ ids: on ? [...s.ids.filter((x) => x !== id), id] : s.ids.filter((x) => x !== id) }));
}

const lockName = (id: string) => `routedust:exec:${id}`;

function webLocks(): LockManager | undefined {
  return typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined;
}

/** The newest copy of an execution: this tab's store, or what another tab wrote to storage since. */
function latestExecution(fallback: RouteExecution): RouteExecution {
  const inStore = useRouterStore.getState().executions[fallback.id] ?? fallback;
  const onDisk = readRecord<RouteExecution>("exec", fallback.id);
  return onDisk && onDisk.updatedAt > inStore.updatedAt ? onDisk : inStore;
}

/** Ids of executions another tab of this browser is running (their Web Lock is held elsewhere). */
export function useRunningElsewhere(ids: string[]): Set<string> {
  const [held, setHeld] = useState<Set<string>>(new Set());
  const key = ids.join(",");
  useEffect(() => {
    const locks = webLocks();
    if (!locks || !key) return;
    let stop = false;
    const tick = async () => {
      try {
        const snapshot = await locks.query();
        const names = new Set((snapshot.held ?? []).map((l) => l.name));
        const mine = new Set(useRunning.getState().ids);
        const next = new Set(key.split(",").filter((id) => names.has(lockName(id)) && !mine.has(id)));
        if (!stop) setHeld((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
      } catch {
        // no lock information: nothing to show
      }
    };
    void tick();
    const t = setInterval(tick, 2_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [key]);
  return held;
}

export function useExecutor() {
  const config = useConfig();
  const { address } = useAccount();
  const upsert = useRouterStore((s) => s.upsertExecution);
  const settings = useRouterStore((s) => s.settings);
  const runningIds = useRunning((s) => s.ids);

  const create = useCallback(
    (candidate: RouteCandidate, options: { amountMode?: "fixed" | "balance"; amountCap?: bigint; groupId?: string; recipient?: Address; origin?: RouteExecution["origin"] } = {}): RouteExecution => {
      const ex: RouteExecution = { ...createExecution(candidate), ...options };
      upsert(ex);
      return ex;
    },
    [upsert],
  );

  const runOne = useCallback(
    async (execution: RouteExecution): Promise<RouteExecution | undefined> => {
      if (!address) throw new Error("Connect a wallet first");
      if (executors.has(execution.id) || starting.has(execution.id)) return undefined; // already running in this tab
      starting.add(execution.id);
      const work = async (): Promise<RouteExecution> => {
        const ex = new RouteExecutor({
          providers,
          clients: getClients(settings.rpcOverrides),
          assets: currentAssets(),
          signer: createWagmiSigner(config, address),
          simulate: settings.simulateBeforeSign,
          // The engine mutates its working copy; the store only ever receives snapshots.
          onUpdate: (updated) => {
            const snapshot = structuredClone(updated);
            if (upsert(snapshot)) unsaved.delete(snapshot.id);
            else unsaved.add(snapshot.id);
            notifyTransition(snapshot, settings.notifications);
          },
          // A step whose nonce snapshot is not on disk would be forgotten by a reload and could be signed again.
          beforeSign: (ex) => (unsaved.has(ex.id) ? STORAGE_FULL : undefined),
          codePins,
          gasSafetyMultiplier: settings.gasSafetyMultiplier,
          slippageBps: settings.slippageBps,
        });
        starting.delete(execution.id);
        executors.set(execution.id, ex);
        setRunning(execution.id, true);
        try {
          // Resume from the newest persisted steps (another page or tab may have advanced them), never restart.
          const latest = latestExecution(execution);
          const fresh: RouteExecution = structuredClone({
            ...latest,
            error: undefined,
            warnings: [],
            state: latest.state === "FAILED" || latest.state === "PAUSED" ? "PLANNED" : latest.state,
          });
          return await ex.run(fresh);
        } finally {
          executors.delete(execution.id);
          setRunning(execution.id, false);
        }
      };
      try {
        const locks = webLocks();
        if (!locks) return await work();
        return await locks.request(lockName(execution.id), { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error("This route is already running in another tab or window of this browser. Continue it there.");
          return work();
        });
      } finally {
        starting.delete(execution.id);
      }
    },
    [address, config, settings.rpcOverrides, settings.simulateBeforeSign, settings.notifications, settings.gasSafetyMultiplier, settings.slippageBps, upsert],
  );

  const run = useCallback(
    async (execution: RouteExecution) => {
      if (executors.size > 0) return undefined; // one route at a time: the wallet signs sequentially
      batchCancelled = false;
      return runOne(execution);
    },
    [runOne],
  );

  /** Runs executions one after another; a failure does not stop the others. */
  const runMany = useCallback(
    async (ids: string[], onEach?: (execution: RouteExecution) => void) => {
      if (executors.size > 0) return;
      batchCancelled = false;
      for (const id of ids) {
        if (batchCancelled) break;
        const latest = useRouterStore.getState().executions[id];
        if (!latest || latest.state === "COMPLETED") continue;
        try {
          const result = await runOne(latest);
          if (result) onEach?.(result);
        } catch {
          // held by another tab: that route goes on there, the rest of the batch continues here
        }
      }
    },
    [runOne],
  );

  const cancel = useCallback(() => {
    batchCancelled = true;
    for (const ex of executors.values()) ex.cancel();
  }, []);

  const isRunning = useCallback((id: string) => runningIds.includes(id), [runningIds]);

  return { create, run, runMany, cancel, isRunning, running: runningIds[runningIds.length - 1] };
}
