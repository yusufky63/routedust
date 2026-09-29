import { NextResponse } from "next/server";
import { createClientResolver } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { createProviders, discoverCapabilities, withLifiIntegration, type DiscoveryResult } from "@testnet-router/providers";
import { stringifyWithBigint } from "@/lib/bigint-json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 5 * 60_000;
/** `?refresh=1` is honoured at most this often: each run is 11 providers × 20 chains of RPC and API calls. */
const MIN_REFRESH_MS = 60_000;

interface CacheEntry {
  at: number;
  promise: Promise<Omit<DiscoveryResult, "graph">>;
  settled: boolean;
}

/** One discovery per server every five minutes, shared by every visitor (pool probes and route lists are not user specific). */
let cache: CacheEntry | undefined;
const providers = createProviders();
const clients = createClientResolver(CHAINS, { timeoutMs: 20_000 });

async function discover(): Promise<Omit<DiscoveryResult, "graph">> {
  // LI.FI calls carry the server-side API key / integrator settings; the key never reaches the browser.
  const result = await discoverCapabilities(providers, { chains: CHAINS, assets: ASSETS, clients, fetch: withLifiIntegration(globalThis.fetch.bind(globalThis)), now: Date.now() }, { timeoutMs: 40_000 });
  return { edges: result.edges, summaries: result.summaries, discoveredAt: result.discoveredAt };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const now = Date.now();
  const age = cache ? now - cache.at : Infinity;
  // A run in flight is always shared; a forced refresh only replaces a settled result older than a minute.
  const stale = !cache || (cache.settled && (age > TTL_MS || (refresh && age > MIN_REFRESH_MS)));
  if (stale) {
    const promise = discover();
    const entry: CacheEntry = { at: now, promise, settled: false };
    cache = entry;
    promise.then(
      () => {
        entry.settled = true;
      },
      () => {
        // A failed discovery must not be served for five minutes.
        if (cache === entry) cache = undefined;
      },
    );
  }
  if (!cache) return NextResponse.json({ error: "discovery unavailable" }, { status: 502 });
  try {
    const result = await cache.promise;
    return new NextResponse(stringifyWithBigint({ ...result, cachedAt: cache.at, ttlMs: TTL_MS }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
