"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Address, ConsolidationPlan, RouteExecution, RouteMode, WalletScan } from "@testnet-router/core";
import { DESTINATION_PRESETS } from "@testnet-router/registry";

export interface Settings {
  mode: RouteMode;
  /** Destination asset id ("chainId:address" | "chainId:native"). */
  destinationAssetId: string;
  allowWrappedOutput: boolean;
  maxBridges: number;
  maxSwaps: number;
  experimentalRoutes: boolean;
  slippageBps: number;
  gasSafetyMultiplier: number;
  /** Hide balances whose formatted value is below this (in the asset's own units). */
  hideBelow: string;
  rpcOverrides: Record<number, string>;
  theme: "dark" | "light";
  simulateBeforeSign: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "BEST_OUTPUT",
  destinationAssetId: DESTINATION_PRESETS[0]?.node.assetId ?? "84532:0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  allowWrappedOutput: false,
  maxBridges: 2,
  maxSwaps: 2,
  experimentalRoutes: false,
  slippageBps: 100,
  gasSafetyMultiplier: 1.25,
  hideBelow: "0",
  rpcOverrides: {},
  theme: "dark",
  simulateBeforeSign: true,
};

interface RouterState {
  settings: Settings;
  /** Read-only address to scan when no wallet is connected. */
  watchAddress?: Address;
  scan?: WalletScan;
  plan?: ConsolidationPlan;
  executions: Record<string, RouteExecution>;
  setSettings: (patch: Partial<Settings>) => void;
  setWatchAddress: (address?: Address) => void;
  setScan: (scan?: WalletScan) => void;
  setPlan: (plan?: ConsolidationPlan) => void;
  upsertExecution: (execution: RouteExecution) => void;
  removeExecution: (id: string) => void;
}

const BIGINT_TAG = "__bigint__";

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && BIGINT_TAG in (value as Record<string, unknown>)) {
    return BigInt((value as Record<string, string>)[BIGINT_TAG] as string);
  }
  return value;
}

export const useRouterStore = create<RouterState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      watchAddress: undefined,
      scan: undefined,
      plan: undefined,
      executions: {},
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setWatchAddress: (watchAddress) => set({ watchAddress, plan: undefined }),
      setScan: (scan) => set({ scan }),
      setPlan: (plan) => set({ plan }),
      upsertExecution: (execution) => set((s) => ({ executions: { ...s.executions, [execution.id]: execution } })),
      removeExecution: (id) =>
        set((s) => {
          const next = { ...s.executions };
          delete next[id];
          return { executions: next };
        }),
    }),
    {
      name: "testnet-router:v1",
      storage: createJSONStorage(() => localStorage, { replacer, reviver }),
      // Plans embed short-lived quotes: never persist them.
      partialize: (s) => ({ settings: s.settings, watchAddress: s.watchAddress, scan: s.scan, executions: s.executions }),
    },
  ),
);
