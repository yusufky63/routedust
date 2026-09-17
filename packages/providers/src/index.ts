import {
  CapabilityGraph,
  type CapabilityEdge,
  type DiscoveryContext,
  type ProviderCapabilitySummary,
  type RouteProvider,
} from "@testnet-router/core";
import { acrossProvider } from "./across/provider";
import { circleCctpProvider } from "./circle-cctp/provider";
export { findDepositForBurns, CCTP_FORWARD_HOOK_DATA, type DepositForBurnLog } from "./circle-cctp/provider";
import { circleGatewayProvider } from "./circle-gateway/provider";
import { hyperlaneProvider } from "./hyperlane/provider";
import { lifiProvider } from "./lifi/provider";
import { opStandardBridgeProvider } from "./op-standard-bridge/provider";
import { stargateProvider } from "./stargate/provider";
import { uniswapProvider } from "./uniswap/provider";
import { uniswapV2Provider } from "./uniswap-v2/provider";
import { uniswapV4Provider } from "./uniswap-v4/provider";
import { wrapProvider } from "./wrap/provider";

export {
  acrossProvider,
  circleCctpProvider,
  circleGatewayProvider,
  hyperlaneProvider,
  lifiProvider,
  opStandardBridgeProvider,
  stargateProvider,
  uniswapProvider,
  uniswapV2Provider,
  uniswapV4Provider,
  wrapProvider,
};
export * from "./shared";
export * from "./coverage";
export { UNISWAP_DEPLOYMENTS_FEED_URL, parseUniswapFeed, type UniswapFeedDeployment } from "./uniswap/feed";
export { LIFI_API_BASE, applyLifiIntegration, lifiFetch, lifiIntegrationFromEnv, withLifiIntegration, type LifiIntegration } from "./lifi/fetch";

export function createProviders(): RouteProvider[] {
  return [
    circleCctpProvider,
    circleGatewayProvider,
    uniswapProvider,
    uniswapV4Provider,
    uniswapV2Provider,
    wrapProvider,
    acrossProvider,
    opStandardBridgeProvider,
    hyperlaneProvider,
    stargateProvider,
    lifiProvider,
  ];
}

export interface DiscoveryResult {
  graph: CapabilityGraph;
  edges: CapabilityEdge[];
  summaries: ProviderCapabilitySummary[];
  discoveredAt: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} discovery timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Runs every provider's discover() in parallel. A failing provider never
 * blocks the graph; it is reported in `summaries` with ok=false.
 */
export async function discoverCapabilities(
  providers: RouteProvider[],
  ctx: DiscoveryContext,
  options: { timeoutMs?: number; onProvider?: (summary: ProviderCapabilitySummary) => void } = {},
): Promise<DiscoveryResult> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const results = await Promise.all(
    providers.map(async (p): Promise<{ edges: CapabilityEdge[]; summary: ProviderCapabilitySummary }> => {
      const discoveredAt = Date.now();
      try {
        const edges = await withTimeout(p.discover(ctx), timeoutMs, p.name);
        const summary: ProviderCapabilitySummary = {
          key: p.key,
          name: p.name,
          edges: edges.length,
          chains: [...new Set(edges.flatMap((e) => [e.from.chainId, e.to.chainId]))],
          ok: true,
          discoveredAt,
          source: p.source,
        };
        options.onProvider?.(summary);
        return { edges, summary };
      } catch (err) {
        const summary: ProviderCapabilitySummary = {
          key: p.key,
          name: p.name,
          edges: 0,
          chains: [],
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          discoveredAt,
          source: p.source,
        };
        options.onProvider?.(summary);
        return { edges: [], summary };
      }
    }),
  );
  const edges = results.flatMap((r) => r.edges);
  return {
    graph: new CapabilityGraph(edges),
    edges,
    summaries: results.map((r) => r.summary),
    discoveredAt: Date.now(),
  };
}
