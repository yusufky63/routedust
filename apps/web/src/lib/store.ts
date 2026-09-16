"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Address, Asset, ConsolidationPlan, RouteExecution, RouteMode, WalletScan } from "@testnet-router/core";
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
  /** List the wallet's other ERC-20s through public Blockscout indexers. */
  discoverTokens: boolean;
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
  discoverTokens: true,
};

/** A group of executions the user chose to run one after another. */
export interface Batch {
  id: string;
  label: string;
  executionIds: string[];
  createdAt: number;
}

interface RouterState {
  settings: Settings;
  /** Read-only address to scan when no wallet is connected. */
  watchAddress?: Address;
  scan?: WalletScan;
  plan?: ConsolidationPlan;
  executions: Record<string, RouteExecution>;
  batches: Record<string, Batch>;
  /** Unverified ERC-20s found in the scanned wallet (Blockscout + on-chain re-read). */
  discoveredAssets: Asset[];
  /** Unverified tokens the user added by address (buy targets). */
  customAssets: Asset[];
  setSettings: (patch: Partial<Settings>) => void;
  setWatchAddress: (address?: Address) => void;
  setScan: (scan?: WalletScan) => void;
  setDiscoveredAssets: (assets: Asset[]) => void;
  addCustomAsset: (asset: Asset) => void;
  removeCustomAsset: (id: string) => void;
  setPlan: (plan?: ConsolidationPlan) => void;
  upsertExecution: (execution: RouteExecution) => void;
  removeExecution: (id: string) => void;
  createBatch: (executionIds: string[], label: string) => Batch;
  removeBatch: (id: string) => void;
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
      batches: {},
      discoveredAssets: [],
      customAssets: [],
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setWatchAddress: (watchAddress) => set({ watchAddress, plan: undefined }),
      setScan: (scan) => set({ scan }),
      setDiscoveredAssets: (discoveredAssets) => set({ discoveredAssets }),
      addCustomAsset: (asset) => set((s) => ({ customAssets: [...s.customAssets.filter((a) => a.id !== asset.id), asset] })),
      removeCustomAsset: (id) => set((s) => ({ customAssets: s.customAssets.filter((a) => a.id !== id) })),
      setPlan: (plan) => set({ plan }),
      upsertExecution: (execution) => set((s) => ({ executions: { ...s.executions, [execution.id]: execution } })),
      removeExecution: (id) =>
        set((s) => {
          const next = { ...s.executions };
          delete next[id];
          return { executions: next };
        }),
      createBatch: (executionIds, label) => {
        const batch: Batch = {
          id: `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          label,
          executionIds,
          createdAt: Date.now(),
        };
        set((s) => ({ batches: { ...s.batches, [batch.id]: batch } }));
        return batch;
      },
      removeBatch: (id) =>
        set((s) => {
          const next = { ...s.batches };
          delete next[id];
          return { batches: next };
        }),
    }),
    {
      name: "testnet-router:v1",
      version: 2,
      // v2: discovered tokens are pruned to sellable ones; drop stale scans that still carry junk.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<RouterState>;
        return { ...p, scan: undefined, discoveredAssets: [] } as never;
      },
      storage: createJSONStorage(() => localStorage, { replacer, reviver }),
      // Settings gain fields over time: persisted values win, new defaults fill the gaps.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<RouterState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
      },
      // Plans embed short-lived quotes: never persist them.
      partialize: (s) => ({
        settings: s.settings,
        watchAddress: s.watchAddress,
        scan: s.scan,
        executions: s.executions,
        batches: s.batches,
        discoveredAssets: s.discoveredAssets,
        customAssets: s.customAssets,
      }),
    },
  ),
);
