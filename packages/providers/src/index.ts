import {
  CapabilityGraph,
  type CapabilityEdge,
  type DiscoveryContext,
  type ProviderCapabilitySummary,
  type RouteProvider,
} from "@testnet-router/core";
import { acrossProvider } from "./across/provider";
import { circleCctpProvider } from "./circle-cctp/provider";
import { opStandardBridgeProvider } from "./op-standard-bridge/provider";
import { uniswapProvider } from "./uniswap/provider";
import { wrapProvider } from "./wrap/provider";

export { acrossProvider, circleCctpProvider, opStandardBridgeProvider, uniswapProvider, wrapProvider };
export * from "./shared";

export function createProviders(): RouteProvider[] {
  return [circleCctpProvider, uniswapProvider, wrapProvider, acrossProvider, opStandardBridgeProvider];
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
