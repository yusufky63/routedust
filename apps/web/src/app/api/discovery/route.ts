import { NextResponse } from "next/server";
import { createClientResolver } from "@testnet-router/core";
import { ASSETS, CHAINS } from "@testnet-router/registry";
import { createProviders, discoverCapabilities, type DiscoveryResult } from "@testnet-router/providers";
import { stringifyWithBigint } from "@/lib/bigint-json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 5 * 60_000;

interface CacheEntry {
  at: number;
  promise: Promise<Omit<DiscoveryResult, "graph">>;
}

/** One discovery per server every five minutes, shared by every visitor (pool probes and route lists are not user specific). */
let cache: CacheEntry | undefined;
const providers = createProviders();
const clients = createClientResolver(CHAINS, { timeoutMs: 20_000 });

async function discover(): Promise<Omit<DiscoveryResult, "graph">> {
  const result = await discoverCapabilities(providers, { chains: CHAINS, assets: ASSETS, clients, fetch: globalThis.fetch.bind(globalThis), now: Date.now() }, { timeoutMs: 40_000 });
  return { edges: result.edges, summaries: result.summaries, discoveredAt: result.discoveredAt };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const now = Date.now();
  if (refresh || !cache || now - cache.at > TTL_MS) {
    const promise = discover();
    cache = { at: now, promise };
    // A failed discovery must not be served for five minutes.
    promise.catch(() => {
      if (cache?.promise === promise) cache = undefined;
    });
  }
  try {
    const result = await cache.promise;
    return new NextResponse(stringifyWithBigint({ ...result, cachedAt: cache.at, ttlMs: TTL_MS }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
