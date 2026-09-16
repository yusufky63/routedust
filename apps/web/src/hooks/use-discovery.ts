"use client";

import { useQuery } from "@tanstack/react-query";
import { getClients, runDiscovery } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

/** Live capability graph. Providers are refreshed at runtime, never hard-coded into UI. */
export function useDiscovery() {
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  return useQuery({
    queryKey: ["discovery", rpcOverrides],
    queryFn: () => runDiscovery(getClients(rpcOverrides)),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    gcTime: 30 * 60_000,
  });
}
