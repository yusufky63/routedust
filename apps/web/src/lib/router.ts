import { createClientResolver, type Asset, type ClientResolver } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { createProviders, discoverCapabilities, type DiscoveryResult } from "@testnet-router/providers";

export const providers = createProviders();

const resolverCache = new Map<string, ClientResolver>();

/** Client resolver honouring user RPC overrides (settings page). */
export function getClients(rpcOverrides: Record<number, string> = {}): ClientResolver {
  const key = JSON.stringify(rpcOverrides);
  let r = resolverCache.get(key);
  if (!r) {
    const overrides: Record<number, string[]> = {};
    for (const [id, url] of Object.entries(rpcOverrides)) {
      if (url.trim()) overrides[Number(id)] = [url.trim(), ...(CHAINS.find((c) => c.id === Number(id))?.rpcUrls ?? [])];
    }
    r = createClientResolver(CHAINS, { rpcOverrides: overrides });
    resolverCache.set(key, r);
  }
  return r;
}

export async function runDiscovery(clients: ClientResolver, assets: Asset[] = ASSETS): Promise<DiscoveryResult> {
  return discoverCapabilities(providers, {
    chains: CHAINS,
    assets,
    clients,
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now(),
    // The Uniswap feed has no CORS headers: read it through the same-origin proxy.
    feeds: { uniswapDeployments: "/api/feeds/uniswap", lifiApiBase: "/api/lifi" },
  });
}
