"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Address, Asset, ConsolidationPlan, RouteExecution, RouteMode, WalletScan } from "@testnet-router/core";
import { DESTINATION_PRESETS } from "@testnet-router/registry";
import { bigintReplacer, bigintReviver } from "./bigint-json";

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
  /**
   * Advanced: discover, sell and buy unverified ERC-20s. Off by default: the
   * product surface is native gas, ETH/WETH and Circle USDC only.
   */
  unverifiedTokens: boolean;
  /** Above this DEX price impact the planner shrinks the amount (PARTIAL) instead of dumping. */
  maxPriceImpactBps: number;
  /** Browser notifications when a long wait (attestation, relay) finishes while the tab is hidden. */
  notifications: boolean;
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
  unverifiedTokens: false,
  maxPriceImpactBps: 500,
  notifications: false,
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
  /** keccak256 of contract bytecode per "chainId:address", pinned the first time the wallet is asked to sign against it. */
  codePins: Record<string, string>;
  setSettings: (patch: Partial<Settings>) => void;
  pinCode: (key: string, hash: string) => void;
  setWatchAddress: (address?: Address) => void;
  setScan: (scan?: WalletScan) => void;
  setDiscoveredAssets: (assets: Asset[]) => void;
  addCustomAsset: (asset: Asset) => void;
  removeCustomAsset: (id: string) => void;
  setPlan: (plan?: ConsolidationPlan) => void;
  upsertExecution: (execution: RouteExecution) => void;
  /** Archives (hides) an execution; history is kept. */
  removeExecution: (id: string) => void;
  restoreExecution: (id: string) => void;
  createBatch: (executionIds: string[], label: string) => Batch;
  removeBatch: (id: string) => void;
}

const replacer = bigintReplacer;
const reviver = bigintReviver;

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
      codePins: {},
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      pinCode: (key, hash) => set((s) => ({ codePins: { ...s.codePins, [key]: hash } })),
      setWatchAddress: (watchAddress) => set({ watchAddress, plan: undefined }),
      setScan: (scan) => set({ scan }),
      setDiscoveredAssets: (discoveredAssets) => set({ discoveredAssets }),
      addCustomAsset: (asset) => set((s) => ({ customAssets: [...s.customAssets.filter((a) => a.id !== asset.id), asset] })),
      removeCustomAsset: (id) => set((s) => ({ customAssets: s.customAssets.filter((a) => a.id !== id) })),
      setPlan: (plan) => set({ plan }),
      upsertExecution: (execution) => set((s) => ({ executions: { ...s.executions, [execution.id]: execution } })),
      // History is never deleted: "remove" archives, so past burns and mints stay auditable.
      removeExecution: (id) =>
        set((s) => {
          const ex = s.executions[id];
          if (!ex) return {};
          return { executions: { ...s.executions, [id]: { ...ex, archivedAt: Date.now() } } };
        }),
      restoreExecution: (id) =>
        set((s) => {
          const ex = s.executions[id];
          if (!ex) return {};
          const { archivedAt: _archived, ...rest } = ex;
          return { executions: { ...s.executions, [id]: rest } };
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
      version: 3,
      // v3: unverified tokens are opt-in; drop stale scans and discovered/custom tokens.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<RouterState>;
        return { ...p, scan: undefined, plan: undefined, discoveredAssets: [], customAssets: [] } as never;
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
        codePins: s.codePins,
      }),
    },
  ),
);
