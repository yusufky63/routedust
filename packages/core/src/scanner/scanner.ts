import { erc20Abi, type PublicClient } from "viem";
import { formatAmount } from "../format/amounts";
import type { Address } from "../types/common";
import type { Asset, AssetBalance, ChainScanResult, WalletScan } from "../types/asset";
import type { ChainConfig } from "../types/chain";
import type { ClientResolver } from "../types/provider";

export interface ScanOptions {
  timeoutMs?: number;
  /** Called as each chain finishes so the UI can render progressively. */
  onChain?: (result: ChainScanResult) => void;
  /** Restrict to these chain IDs. */
  chainIds?: number[];
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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

async function readErc20Balances(
  client: PublicClient,
  wallet: Address,
  tokens: Asset[],
): Promise<Map<string, { raw?: bigint; error?: string }>> {
  const out = new Map<string, { raw?: bigint; error?: string }>();
  if (tokens.length === 0) return out;
  const contracts = tokens.map((t) => ({
    address: t.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [wallet] as const,
  }));

  try {
    const results = await client.multicall({ contracts, allowFailure: true });
    results.forEach((r, i) => {
      const token = tokens[i];
      if (!token) return;
      if (r.status === "success") out.set(token.id, { raw: r.result as bigint });
      else out.set(token.id, { error: r.error?.message ?? "multicall failure" });
    });
    return out;
  } catch {
    // Multicall3 may be missing on a young testnet: fall back to single calls.
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const raw = await client.readContract({
            address: t.address as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
          });
          out.set(t.id, { raw });
        } catch (err) {
          out.set(t.id, { error: err instanceof Error ? err.message : String(err) });
        }
      }),
    );
    return out;
  }
}

export async function scanChain(
  wallet: Address,
  chain: ChainConfig,
  assets: Asset[],
  clients: ClientResolver,
  timeoutMs = 20_000,
): Promise<ChainScanResult> {
  const started = Date.now();
  const chainAssets = assets.filter((a) => a.chainId === chain.id);
  const native = chainAssets.find((a) => a.kind === "NATIVE");
  const tokens = chainAssets.filter((a) => a.kind !== "NATIVE" && a.address);

  try {
    const client = clients.get(chain.id);
    const [nativeRaw, tokenBalances, blockNumber] = await withTimeout(
      Promise.all([
        client.getBalance({ address: wallet }),
        readErc20Balances(client, wallet, tokens),
        client.getBlockNumber().catch(() => undefined),
      ]),
      timeoutMs,
      chain.name,
    );

    const now = Date.now();
    const balances: AssetBalance[] = [];
    if (native) {
      balances.push({
        asset: native,
        raw: nativeRaw,
        formatted: formatAmount(nativeRaw, native.decimals),
        fetchedAt: now,
      });
    }
    for (const t of tokens) {
      const r = tokenBalances.get(t.id);
      const raw = r?.raw ?? 0n;
      balances.push({
        asset: t,
        raw,
        formatted: formatAmount(raw, t.decimals),
        fetchedAt: now,
        error: r?.error,
      });
    }
    return {
      chainId: chain.id,
      balances,
      ok: true,
      latencyMs: now - started,
      blockNumber,
    };
  } catch (err) {
    return {
      chainId: chain.id,
      balances: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Scans the wallet across every configured chain in parallel. A chain failure
 * never fails the whole scan; the chain is reported with ok=false.
 */
export async function scanWallet(
  wallet: Address,
  chains: ChainConfig[],
  assets: Asset[],
  clients: ClientResolver,
  options: ScanOptions = {},
): Promise<WalletScan> {
  const selected = options.chainIds ? chains.filter((c) => options.chainIds?.includes(c.id)) : chains;
  const results = await Promise.all(
    selected.map(async (chain) => {
      const r = await scanChain(wallet, chain, assets, clients, options.timeoutMs);
      options.onChain?.(r);
      return r;
    }),
  );
  return { wallet, scannedAt: Date.now(), chains: results };
}

export interface Erc20Verification {
  address: Address;
  hasCode: boolean;
  symbol?: string;
  decimals?: number;
  error?: string;
}

/** Runtime verification used before enabling WRAP edges or trusting a token. */
export async function verifyErc20(client: PublicClient, address: Address): Promise<Erc20Verification> {
  try {
    const code = await client.getCode({ address });
    if (!code || code === "0x") return { address, hasCode: false };
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { address, hasCode: true, symbol, decimals };
  } catch (err) {
    return { address, hasCode: true, error: err instanceof Error ? err.message : String(err) };
  }
}

export function nonZeroBalances(scan: WalletScan): AssetBalance[] {
  return scan.chains.flatMap((c) => c.balances.filter((b) => b.raw > 0n));
}

export function nativeBalanceOf(scan: WalletScan, chainId: number): bigint {
  const chain = scan.chains.find((c) => c.chainId === chainId);
  const native = chain?.balances.find((b) => b.asset.kind === "NATIVE");
  return native?.raw ?? 0n;
}
