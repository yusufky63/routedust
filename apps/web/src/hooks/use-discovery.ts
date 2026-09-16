"use client";

import { useQuery } from "@tanstack/react-query";
import { useAllAssets } from "@/lib/assets";
import { getClients, runDiscovery } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

/**
 * Live capability graph. Providers are refreshed at runtime, never hard-coded
 * into UI. Re-runs when the set of unverified tokens (wallet-discovered or
 * user-added) changes, because the DEX adapter probes pools for them.
 */
export function useDiscovery() {
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const assets = useAllAssets();
  const extraKey = assets
    .filter((a) => !a.verified)
    .map((a) => a.id)
    .sort()
    .join(",");
  return useQuery({
    queryKey: ["discovery", rpcOverrides, extraKey],
    queryFn: () => runDiscovery(getClients(rpcOverrides), assets),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    gcTime: 30 * 60_000,
  });
}
