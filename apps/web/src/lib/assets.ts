"use client";

import { useMemo } from "react";
import type { Asset } from "@testnet-router/core";
import { ASSETS } from "@testnet-router/registry";
import { useRouterStore } from "./store";

/**
 * Registry assets first, then wallet-discovered and user-added tokens (never
 * overriding a registry id). Unverified tokens are only included when the
 * advanced "unverified tokens" setting is on; the default product surface is
 * native gas, ETH/WETH and Circle USDC.
 */
export function mergeAssets(discovered: Asset[], custom: Asset[], includeUnverified: boolean): Asset[] {
  const map = new Map(ASSETS.map((a) => [a.id, a] as const));
  if (includeUnverified) {
    for (const a of [...discovered, ...custom]) if (!map.has(a.id)) map.set(a.id, a);
  }
  return [...map.values()];
}

export function useAllAssets(): Asset[] {
  const discovered = useRouterStore((s) => s.discoveredAssets);
  const custom = useRouterStore((s) => s.customAssets);
  const unverified = useRouterStore((s) => s.settings.unverifiedTokens);
  return useMemo(() => mergeAssets(discovered, custom, unverified), [discovered, custom, unverified]);
}

export function currentAssets(): Asset[] {
  const s = useRouterStore.getState();
  return mergeAssets(s.discoveredAssets, s.customAssets, s.settings.unverifiedTokens);
}

/** Lookup across registry, wallet-discovered and user-added assets. */
export function findAnyAsset(id: string): Asset | undefined {
  return currentAssets().find((a) => a.id === id);
}
