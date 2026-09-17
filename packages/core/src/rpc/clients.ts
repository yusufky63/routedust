import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient } from "viem";
import type { ChainConfig } from "../types/chain";
import type { ClientResolver } from "../types/provider";

export const CANONICAL_MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export function toViemChain(chain: ChainConfig, rpcUrls?: string[]): Chain {
  const urls = rpcUrls && rpcUrls.length > 0 ? rpcUrls : chain.rpcUrls;
  return defineChain({
    id: chain.id,
    name: chain.name,
    testnet: true,
    nativeCurrency: {
      name: chain.nativeAsset.name,
      symbol: chain.nativeAsset.symbol,
      decimals: chain.nativeAsset.decimals,
    },
    rpcUrls: {
      default: { http: urls },
    },
    blockExplorers: {
      default: { name: "Explorer", url: chain.explorerUrl },
    },
    contracts: {
      multicall3: { address: chain.multicall3 ?? CANONICAL_MULTICALL3 },
    },
  });
}

export interface ClientOptions {
  /** Per-chain RPC overrides (e.g. user settings). */
  rpcOverrides?: Record<number, string[]>;
  timeoutMs?: number;
}

export function createClientResolver(chains: ChainConfig[], options: ClientOptions = {}): ClientResolver {
  const byId = new Map(chains.map((c) => [c.id, c] as const));
  const cache = new Map<number, PublicClient>();
  const timeout = options.timeoutMs ?? 15_000;

  return {
    chain(chainId: number): ChainConfig {
      const c = byId.get(chainId);
      if (!c) throw new Error(`Unknown chain ${chainId}`);
      return c;
    },
    get(chainId: number): PublicClient {
      const cached = cache.get(chainId);
      if (cached) return cached;
      const cfg = this.chain(chainId);
      const urls = options.rpcOverrides?.[chainId] ?? cfg.rpcUrls;
      const chain = toViemChain(cfg, urls);
      const client = createPublicClient({
        chain,
        transport: fallback(
          urls.map((u) => http(u, { timeout, retryCount: 1, batch: true })),
          { rank: false },
        ),
        batch: { multicall: { wait: 16 } },
      }) as PublicClient;
      cache.set(chainId, client);
      return client;
    },
    secondary(chainId: number): PublicClient | undefined {
      const cfg = this.chain(chainId);
      const urls = options.rpcOverrides?.[chainId] ?? cfg.rpcUrls;
      const url = urls[1];
      if (!url) return undefined;
      const key = -chainId; // separate cache slot for the secondary endpoint
      const cached = cache.get(key);
      if (cached) return cached;
      const client = createPublicClient({ chain: toViemChain(cfg, [url]), transport: http(url, { timeout, retryCount: 0 }) }) as PublicClient;
      cache.set(key, client);
      return client;
    },
  };
}

export interface RpcHealth {
  url: string;
  chainId: number;
  expectedChainId: number;
  ok: boolean;
  status: "UP" | "DEGRADED" | "DOWN" | "WRONG_CHAIN";
  latencyMs: number;
  blockNumber?: bigint;
  error?: string;
  checkedAt: number;
}

/** Never accept an endpoint returning the wrong chain ID (spec section 38). */
export async function checkRpc(url: string, expectedChainId: number, timeoutMs = 8_000): Promise<RpcHealth> {
  const started = Date.now();
  const client = createPublicClient({ transport: http(url, { timeout: timeoutMs, retryCount: 0 }) });
  try {
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    const latencyMs = Date.now() - started;
    if (chainId !== expectedChainId) {
      return {
        url,
        chainId,
        expectedChainId,
        ok: false,
        status: "WRONG_CHAIN",
        latencyMs,
        blockNumber,
        error: `Endpoint returned chain ${chainId}, expected ${expectedChainId}`,
        checkedAt: Date.now(),
      };
    }
    return {
      url,
      chainId,
      expectedChainId,
      ok: true,
      status: latencyMs > 4_000 ? "DEGRADED" : "UP",
      latencyMs,
      blockNumber,
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      url,
      chainId: 0,
      expectedChainId,
      ok: false,
      status: "DOWN",
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      checkedAt: Date.now(),
    };
  }
}
