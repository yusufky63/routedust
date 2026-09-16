import { erc20Abi, isAddress, type PublicClient } from "viem";
import type { Asset } from "../types/asset";
import type { ChainConfig } from "../types/chain";
import type { Address, SourceProvenance } from "../types/common";
import type { ClientResolver } from "../types/provider";

/** A token as reported by an indexer. Everything here is untrusted display data. */
export interface IndexedToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Balance according to the indexer (re-read on-chain before use). */
  indexedBalance: bigint;
}

export interface TokenDiscoveryChainResult {
  chainId: number;
  ok: boolean;
  indexed: number;
  kept: number;
  error?: string;
}

export interface TokenDiscoveryResult {
  assets: Asset[];
  chains: TokenDiscoveryChainResult[];
}

const SYMBOL_RE = /[^A-Za-z0-9._$-]/g;

/** Token names/symbols are display data, never identity: strip anything odd and cap the length. */
export function sanitizeSymbol(raw: unknown, fallback = "TOKEN"): string {
  const s = String(raw ?? "")
    .replace(SYMBOL_RE, "")
    .slice(0, 12);
  return s.length > 0 ? s : fallback;
}

export function sanitizeName(raw: unknown, fallback = "Unknown token"): string {
  const s = String(raw ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim()
    .slice(0, 40);
  return s.length > 0 ? s : fallback;
}

interface BlockscoutItem {
  token?: { address?: string; address_hash?: string; symbol?: string; name?: string; decimals?: string | number; type?: string };
  value?: string;
}

interface BlockscoutPage {
  items?: BlockscoutItem[];
  next_page_params?: Record<string, string | number> | null;
}

/** Blockscout v2: GET /api/v2/addresses/{wallet}/tokens?type=ERC-20 (paginated). */
export async function fetchBlockscoutTokens(
  fetchImpl: typeof fetch,
  baseUrl: string,
  wallet: Address,
  options: { maxPages?: number; timeoutMs?: number } = {},
): Promise<IndexedToken[]> {
  const maxPages = options.maxPages ?? 2;
  const out: IndexedToken[] = [];
  let params: Record<string, string | number> | null | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const qs = new URLSearchParams({ type: "ERC-20" });
    for (const [k, v] of Object.entries(params ?? {})) qs.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/v2/addresses/${wallet}/tokens?${qs.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
      const data = (await res.json()) as BlockscoutPage;
      for (const item of data.items ?? []) {
        const t = item.token;
        const address = t?.address_hash ?? t?.address;
        if (!t || !address || !isAddress(address)) continue;
        if (t.type && t.type !== "ERC-20") continue;
        const decimals = Number(t.decimals);
        let indexedBalance = 0n;
        try {
          indexedBalance = BigInt(item.value ?? "0");
        } catch {
          indexedBalance = 0n;
        }
        out.push({
          address: address as Address,
          symbol: sanitizeSymbol(t.symbol),
          name: sanitizeName(t.name),
          decimals: Number.isFinite(decimals) ? decimals : 18,
          indexedBalance,
        });
      }
      params = data.next_page_params;
      if (!params) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/**
 * Re-reads decimals and balance on-chain for indexed tokens and turns the
 * survivors into UNVERIFIED assets keyed by chain + address.
 */
export async function verifyIndexedTokens(
  client: PublicClient,
  chainId: number,
  wallet: Address,
  tokens: IndexedToken[],
  source: SourceProvenance,
): Promise<Asset[]> {
  if (tokens.length === 0) return [];
  const contracts = tokens.flatMap((t) => [
    { address: t.address, abi: erc20Abi, functionName: "decimals" as const },
    { address: t.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [wallet] as const },
  ]);
  const results = await client.multicall({ contracts, allowFailure: true });
  const assets: Asset[] = [];
  tokens.forEach((t, i) => {
    const dec = results[i * 2];
    const bal = results[i * 2 + 1];
    if (!dec || !bal || dec.status !== "success" || bal.status !== "success") return;
    const decimals = Number(dec.result);
    const balance = bal.result as bigint;
    if (!Number.isFinite(decimals) || decimals > 36 || balance <= 0n) return;
    assets.push({
      id: `${chainId}:${t.address.toLowerCase()}`,
      chainId,
      // Identity is the contract, never the symbol: two "USDC" spam tokens stay distinct.
      canonicalAssetId: `TOKEN:${t.address.toLowerCase()}`,
      kind: "ERC20",
      address: t.address,
      decimals,
      symbol: t.symbol,
      name: t.name,
      representation: "UNKNOWN",
      verified: false,
      source,
    });
  });
  return assets;
}

export interface DiscoverTokensOptions {
  /** Max tokens kept per chain after on-chain verification. */
  maxPerChain?: number;
  chainIds?: number[];
  onChain?: (result: TokenDiscoveryChainResult) => void;
}

/**
 * Lists a wallet's ERC-20 holdings through each chain's public indexer, drops
 * registry-known contracts, verifies decimals/balances on-chain and returns
 * the rest as unverified assets. Chains without an indexer are skipped.
 */
export async function discoverWalletTokens(
  wallet: Address,
  chains: ChainConfig[],
  knownAssets: Asset[],
  clients: ClientResolver,
  fetchImpl: typeof fetch,
  options: DiscoverTokensOptions = {},
): Promise<TokenDiscoveryResult> {
  const maxPerChain = options.maxPerChain ?? 60;
  const known = new Set(knownAssets.filter((a) => a.address).map((a) => `${a.chainId}:${a.address?.toLowerCase()}`));
  const selected = chains.filter((c) => c.tokenIndexer && (!options.chainIds || options.chainIds.includes(c.id)));
  const results = await Promise.all(
    selected.map(async (chain): Promise<{ assets: Asset[]; result: TokenDiscoveryChainResult }> => {
      const indexer = chain.tokenIndexer as NonNullable<ChainConfig["tokenIndexer"]>;
      try {
        const indexed = await fetchBlockscoutTokens(fetchImpl, indexer.baseUrl, wallet);
        const fresh = indexed.filter((t) => !known.has(`${chain.id}:${t.address.toLowerCase()}`)).filter((t) => t.indexedBalance > 0n);
        const deduped = [...new Map(fresh.map((t) => [t.address.toLowerCase(), t])).values()].slice(0, maxPerChain);
        const assets = await verifyIndexedTokens(clients.get(chain.id), chain.id, wallet, deduped, {
          kind: "runtime",
          url: `${indexer.baseUrl}/address/${wallet}`,
          lastVerifiedAt: new Date().toISOString(),
          note: "Listed by Blockscout; decimals and balance re-read on-chain; identity unverified",
        });
        const result = { chainId: chain.id, ok: true, indexed: indexed.length, kept: assets.length };
        options.onChain?.(result);
        return { assets, result };
      } catch (err) {
        const result = { chainId: chain.id, ok: false, indexed: 0, kept: 0, error: err instanceof Error ? err.message : String(err) };
        options.onChain?.(result);
        return { assets: [], result };
      }
    }),
  );
  return { assets: results.flatMap((r) => r.assets), chains: results.map((r) => r.result) };
}
