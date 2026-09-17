"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { CapabilityGraph, type Asset, type CapabilityEdge, type ProviderCapabilitySummary } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { discoverCapabilities, uniswapProvider, type DiscoveryResult } from "@testnet-router/providers";
import { useAllAssets } from "@/lib/assets";
import { parseWithBigint } from "@/lib/bigint-json";
import { getClients, runDiscovery } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

interface ServerDiscovery {
  edges: CapabilityEdge[];
  summaries: ProviderCapabilitySummary[];
  discoveredAt: number;
  cachedAt: number;
}

let forceServerRefresh = false;
const LIFI_PROXY_BASE = "/api/lifi";

/**
 * Shared discovery: the server runs every provider once per five minutes for
 * the registry assets and every visitor reuses it (pool probes and route
 * lists are not user specific). The browser only adds what is user specific:
 * DEX pools for unverified tokens it found in the wallet. Custom RPC
 * overrides or a server failure fall back to full client-side discovery.
 */
async function sharedDiscovery(assets: Asset[], rpcOverrides: Record<number, string>): Promise<DiscoveryResult> {
  const clients = getClients(rpcOverrides);
  const hasOverrides = Object.values(rpcOverrides).some((u) => u.trim());
  if (hasOverrides) return runDiscovery(clients, assets);

  let server: ServerDiscovery;
  try {
    const refresh = forceServerRefresh;
    forceServerRefresh = false;
    const res = await fetch(`/api/discovery${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    server = parseWithBigint<ServerDiscovery>(await res.text());
  } catch {
    return runDiscovery(clients, assets);
  }

  // Browser-side LI.FI calls go through the same-origin proxy (API key stays on the server).
  let edges = server.edges.map((e) => (e.provider === "lifi" ? { ...e, meta: { ...(e.meta ?? {}), apiBase: LIFI_PROXY_BASE } } : e));
  let summaries = server.summaries;
  const extras = assets.filter((a) => !a.verified);
  if (extras.length > 0) {
    // Wallet-specific: probe pools for the unverified tokens, replacing the server's DEX edges.
    const local = await discoverCapabilities([uniswapProvider], {
      chains: CHAINS,
      assets: [...ASSETS, ...extras],
      clients,
      fetch: globalThis.fetch.bind(globalThis),
      now: Date.now(),
      feeds: { uniswapDeployments: "/api/feeds/uniswap" },
    });
    if (local.summaries[0]?.ok) {
      edges = [...edges.filter((e) => e.provider !== uniswapProvider.key), ...local.edges];
      summaries = summaries.map((s) => (s.key === uniswapProvider.key ? (local.summaries[0] as ProviderCapabilitySummary) : s));
    }
  }
  return { graph: new CapabilityGraph(edges), edges, summaries, discoveredAt: server.discoveredAt };
}

export function useDiscovery() {
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const assets = useAllAssets();
  const queryClient = useQueryClient();
  const extraKey = assets
    .filter((a) => !a.verified)
    .map((a) => a.id)
    .sort()
    .join(",");
  const query = useQuery({
    queryKey: ["discovery", rpcOverrides, extraKey],
    queryFn: () => sharedDiscovery(assets, rpcOverrides),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  /** Re-runs discovery on the server as well, not just re-reads its cache. */
  const refetchFresh = useCallback(async () => {
    forceServerRefresh = true;
    await queryClient.invalidateQueries({ queryKey: ["discovery"] });
  }, [queryClient]);
  return { ...query, refetchFresh };
}
