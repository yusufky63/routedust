"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Address, Asset, ConsolidationPlan, Hex, RouteExecution, RouteMode, WalletScan } from "@testnet-router/core";
import { DESTINATION_PRESETS } from "@testnet-router/registry";
import { bigintReplacer, bigintReviver } from "./bigint-json";
import { parseRecord, parseRecordKey, readRecord, readRecords, removeRecord, safeLocalStorage, unsavedRecords, writeRecord } from "./record-storage";

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
  /** Optional destination address for routes and swaps (empty = the connected wallet). */
  recipient: string;
  /** Router results: one row per route (compact) or the full cards (detailed). */
  routerView: "compact" | "detailed";
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
  recipient: "",
  routerView: "detailed",
};

/** A group of executions the user chose to run one after another. */
export interface Batch {
  id: string;
  label: string;
  executionIds: string[];
  createdAt: number;
}

/** A withdrawal off an OP Stack rollup: started here, or added by its L2 transaction hash. */
export interface TrackedWithdrawal {
  /** `${l2ChainId}:${l2TxHash}` */
  key: string;
  l2ChainId: number;
  l2TxHash: Hex;
  /** wei, as known when it was added (the portal is the source of truth). */
  amount?: bigint;
  startedAt: number;
  /** Set once the final L1 transaction confirmed. */
  finalizedAt?: number;
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
  /** Rollup withdrawals in flight (days long), keyed "chainId:l2TxHash". */
  withdrawals: Record<string, TrackedWithdrawal>;
  trackWithdrawal: (withdrawal: TrackedWithdrawal) => void;
  forgetWithdrawal: (key: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  pinCode: (key: string, hash: string) => void;
  setWatchAddress: (address?: Address) => void;
  setScan: (scan?: WalletScan) => void;
  setDiscoveredAssets: (assets: Asset[]) => void;
  addCustomAsset: (asset: Asset) => void;
  removeCustomAsset: (id: string) => void;
  setPlan: (plan?: ConsolidationPlan) => void;
  /** False when the execution could not be written to storage (it is kept in memory and in the blob fallback). */
  upsertExecution: (execution: RouteExecution) => boolean;
  /** Archives (hides) an execution; history is kept. */
  removeExecution: (id: string) => void;
  restoreExecution: (id: string) => void;
  createBatch: (executionIds: string[], label: string) => Batch;
  removeBatch: (id: string) => void;
}

function unsavedOnly<T>(kind: "exec" | "batch" | "withdrawal", items: Record<string, T>): Record<string, T> {
  if (unsavedRecords.size === 0) return {};
  return Object.fromEntries(Object.entries(items).filter(([id]) => unsavedRecords.has(`${kind}:${id}`)));
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
      withdrawals: {},
      trackWithdrawal: (withdrawal) =>
        set((s) => {
          const merged = { ...s.withdrawals[withdrawal.key], ...withdrawal };
          writeRecord("withdrawal", withdrawal.key, merged);
          return { withdrawals: { ...s.withdrawals, [withdrawal.key]: merged } };
        }),
      forgetWithdrawal: (key) =>
        set((s) => {
          const next = { ...s.withdrawals };
          delete next[key];
          removeRecord("withdrawal", key);
          return { withdrawals: next };
        }),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      pinCode: (key, hash) => set((s) => ({ codePins: { ...s.codePins, [key]: hash } })),
      setWatchAddress: (watchAddress) => set({ watchAddress, plan: undefined }),
      setScan: (scan) => set({ scan }),
      setDiscoveredAssets: (discoveredAssets) => set({ discoveredAssets }),
      addCustomAsset: (asset) => set((s) => ({ customAssets: [...s.customAssets.filter((a) => a.id !== asset.id), asset] })),
      removeCustomAsset: (id) => set((s) => ({ customAssets: s.customAssets.filter((a) => a.id !== id) })),
      setPlan: (plan) => set({ plan }),
      upsertExecution: (execution) => {
        const saved = writeRecord("exec", execution.id, execution);
        set((s) => ({ executions: { ...s.executions, [execution.id]: execution } }));
        return saved;
      },
      // History is never deleted: "remove" archives, so past burns and mints stay auditable.
      removeExecution: (id) =>
        set((s) => {
          const ex = s.executions[id];
          if (!ex) return {};
          const archived = { ...ex, archivedAt: Date.now() };
          writeRecord("exec", id, archived);
          return { executions: { ...s.executions, [id]: archived } };
        }),
      restoreExecution: (id) =>
        set((s) => {
          const ex = s.executions[id];
          if (!ex) return {};
          const { archivedAt: _archived, ...rest } = ex;
          writeRecord("exec", id, rest);
          return { executions: { ...s.executions, [id]: rest } };
        }),
      createBatch: (executionIds, label) => {
        const batch: Batch = {
          id: `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          label,
          executionIds,
          createdAt: Date.now(),
        };
        writeRecord("batch", batch.id, batch);
        set((s) => ({ batches: { ...s.batches, [batch.id]: batch } }));
        return batch;
      },
      removeBatch: (id) =>
        set((s) => {
          const next = { ...s.batches };
          delete next[id];
          removeRecord("batch", id);
          return { batches: next };
        }),
    }),
    {
      name: "testnet-router:v1",
      version: 4,
      migrate: (persisted, version) => {
        const p = { ...((persisted ?? {}) as Partial<RouterState>) };
        // v3: unverified tokens are opt-in; drop stale scans and discovered/custom tokens.
        if (version < 3) Object.assign(p, { scan: undefined, plan: undefined, discoveredAssets: [], customAssets: [] });
        // v4: executions, batches and withdrawals move to one key each (see record-storage.ts). A copy that
        // is already there and newer (written by this version in another tab) is never overwritten, and a
        // record whose key cannot be written stays in the blob.
        const keep = <T,>(kind: "exec" | "batch" | "withdrawal", items: Record<string, T> | undefined, id: (v: T) => string, updatedAt: (v: T) => number) => {
          const left: Record<string, T> = {};
          for (const value of Object.values(items ?? {})) {
            const existing = readRecord<T>(kind, id(value));
            if (existing && updatedAt(existing) >= updatedAt(value)) continue;
            if (!writeRecord(kind, id(value), value)) left[id(value)] = value;
          }
          return left;
        };
        p.executions = keep<RouteExecution>("exec", p.executions, (e) => e.id, (e) => e.updatedAt);
        p.batches = keep<Batch>("batch", p.batches, (b) => b.id, (b) => b.createdAt);
        p.withdrawals = keep<TrackedWithdrawal>("withdrawal", p.withdrawals, (w) => w.key, (w) => w.finalizedAt ?? w.startedAt);
        return p as never;
      },
      storage: createJSONStorage(() => safeLocalStorage, { replacer, reviver }),
      // Settings gain fields over time: persisted values win, new defaults fill the gaps.
      // Records come from their own keys, never from the blob.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<RouterState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          // Per-key records win; the blob only carries the ones storage refused to take. On a rehydrate
          // (another tab rewrote the blob) records only this tab holds in memory are kept.
          executions: { ...current.executions, ...(p.executions ?? {}), ...readRecords<RouteExecution>("exec") },
          batches: { ...current.batches, ...(p.batches ?? {}), ...readRecords<Batch>("batch") },
          withdrawals: { ...current.withdrawals, ...(p.withdrawals ?? {}), ...readRecords<TrackedWithdrawal>("withdrawal") },
        };
      },
      // Plans embed short-lived quotes: never persist them. Records live in their own keys; only those
      // storage refused to take ride along here until they can be written.
      partialize: (s) => ({
        settings: s.settings,
        watchAddress: s.watchAddress,
        scan: s.scan,
        discoveredAssets: s.discoveredAssets,
        customAssets: s.customAssets,
        codePins: s.codePins,
        executions: unsavedOnly("exec", s.executions),
        batches: unsavedOnly("batch", s.batches),
        withdrawals: unsavedOnly("withdrawal", s.withdrawals),
      }),
    },
  ),
);

/**
 * Another tab rewrote the blob (settings, code pins, scan): reload it before this tab writes its own copy,
 * so a record update here never puts older settings or pins back on disk. Rehydrating writes the same
 * value back, which fires no further event.
 */
function applyBlobFromOtherTab(event: StorageEvent): void {
  if (event.key === "testnet-router:v1" && event.newValue) void useRouterStore.persist.rehydrate();
}

/**
 * Another tab wrote a record: take it unless ours is strictly newer. An equal
 * updatedAt still applies (archiving does not bump it), and only one tab can
 * be running an execution at a time (Web Lock), so there is no race to lose.
 */
function applyRecordFromOtherTab(event: StorageEvent): void {
  const rec = parseRecordKey(event.key);
  if (!rec) return;
  const value = parseRecord<unknown>(event.newValue);
  useRouterStore.setState((s) => {
    if (rec.kind === "exec") {
      const incoming = value as RouteExecution | undefined;
      const current = s.executions[rec.id];
      if (!incoming || (current && current.updatedAt > incoming.updatedAt)) return {};
      return { executions: { ...s.executions, [rec.id]: incoming } };
    }
    if (rec.kind === "batch") {
      const next = { ...s.batches };
      if (value) next[rec.id] = value as Batch;
      else delete next[rec.id];
      return { batches: next };
    }
    const next = { ...s.withdrawals };
    if (value) next[rec.id] = value as TrackedWithdrawal;
    else delete next[rec.id];
    return { withdrawals: next };
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", applyBlobFromOtherTab);
  window.addEventListener("storage", applyRecordFromOtherTab);
}
