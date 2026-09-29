"use client";

import { useCallback } from "react";
import { isAddress } from "viem";
import { create } from "zustand";
import { planConsolidation, rescorePlan, type ConsolidationPlan, type PlannerProgress, type RouteMode, type WalletScan } from "@testnet-router/core";
import { CHAINS, nodeOf } from "@testnet-router/registry";
import type { DiscoveryResult } from "@testnet-router/providers";
import { useAllAssets } from "@/lib/assets";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

interface PlanStatus {
  planning: boolean;
  progress?: PlannerProgress;
  error?: string;
}

/** Shared across pages: a plan that is still running when you leave the Router is not started a second time. */
const usePlanStatus = create<PlanStatus>(() => ({ planning: false }));

/** True when `plan` was made for this scan and target, so there is nothing to re-plan. */
export function planIsCurrent(plan: ConsolidationPlan | undefined, scan: WalletScan | undefined, destinationAssetId: string): boolean {
  return Boolean(plan && scan && plan.wallet.toLowerCase() === scan.wallet.toLowerCase() && plan.destination.assetId === destinationAssetId && plan.createdAt >= scan.scannedAt);
}

export function usePlan(scan: WalletScan | undefined, discovery: DiscoveryResult | undefined) {
  const plan = useRouterStore((s) => s.plan);
  const setPlan = useRouterStore((s) => s.setPlan);
  const settings = useRouterStore((s) => s.settings);
  const setSettings = useRouterStore((s) => s.setSettings);
  const assets = useAllAssets();
  const { planning, progress, error } = usePlanStatus();

  const runPlan = useCallback(async () => {
    if (!scan || !discovery || usePlanStatus.getState().planning) return;
    const destAsset = assets.find((a) => a.id === settings.destinationAssetId);
    if (!destAsset) {
      usePlanStatus.setState({ error: "Unknown destination asset" });
      return;
    }
    usePlanStatus.setState({ planning: true, error: undefined, progress: undefined });
    try {
      const result = await planConsolidation({
        wallet: scan.wallet,
        recipient: isAddress(settings.recipient) ? settings.recipient : undefined,
        scan,
        destination: nodeOf(destAsset),
        mode: settings.mode,
        limits: {
          allowWrappedOutput: settings.allowWrappedOutput,
          maxBridges: settings.maxBridges,
          maxSwaps: settings.maxSwaps,
          experimentalRoutes: settings.experimentalRoutes,
          slippageBps: settings.slippageBps,
          gasSafetyMultiplier: settings.gasSafetyMultiplier,
          maxPriceImpactBps: settings.maxPriceImpactBps,
        },
        graph: discovery.graph,
        providers,
        clients: getClients(settings.rpcOverrides),
        assets,
        chains: CHAINS,
        onProgress: (p) => usePlanStatus.setState({ progress: p }),
      });
      setPlan(result);
    } catch (err) {
      usePlanStatus.setState({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      usePlanStatus.setState({ planning: false });
    }
  }, [scan, discovery, settings, setPlan, assets]);

  const setMode = useCallback(
    (mode: RouteMode) => {
      setSettings({ mode });
      if (plan) setPlan(rescorePlan(plan, mode, { allowWrappedOutput: settings.allowWrappedOutput }));
    },
    [plan, setPlan, setSettings, settings.allowWrappedOutput],
  );

  return { plan, planning, progress, error, runPlan, setMode };
}
