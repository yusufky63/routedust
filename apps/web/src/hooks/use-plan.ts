"use client";

import { useCallback, useState } from "react";
import { planConsolidation, rescorePlan, type PlannerProgress, type RouteMode, type WalletScan } from "@testnet-router/core";
import { ASSETS, CHAINS, findAsset, nodeOf } from "@testnet-router/registry";
import type { DiscoveryResult } from "@testnet-router/providers";
import { getClients, providers } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

export function usePlan(scan: WalletScan | undefined, discovery: DiscoveryResult | undefined) {
  const plan = useRouterStore((s) => s.plan);
  const setPlan = useRouterStore((s) => s.setPlan);
  const settings = useRouterStore((s) => s.settings);
  const setSettings = useRouterStore((s) => s.setSettings);
  const [planning, setPlanning] = useState(false);
  const [progress, setProgress] = useState<PlannerProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const runPlan = useCallback(async () => {
    if (!scan || !discovery) return;
    const destAsset = findAsset(settings.destinationAssetId);
    if (!destAsset) {
      setError("Unknown destination asset");
      return;
    }
    setPlanning(true);
    setError(undefined);
    try {
      const result = await planConsolidation({
        wallet: scan.wallet,
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
        },
        graph: discovery.graph,
        providers,
        clients: getClients(settings.rpcOverrides),
        assets: ASSETS,
        chains: CHAINS,
        onProgress: setProgress,
      });
      setPlan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }, [scan, discovery, settings, setPlan]);

  const setMode = useCallback(
    (mode: RouteMode) => {
      setSettings({ mode });
      if (plan) setPlan(rescorePlan(plan, mode, { allowWrappedOutput: settings.allowWrappedOutput }));
    },
    [plan, setPlan, setSettings, settings.allowWrappedOutput],
  );

  return { plan, planning, progress, error, runPlan, setMode };
}
