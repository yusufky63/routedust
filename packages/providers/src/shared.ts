import { encodeFunctionData, erc20Abi, type PublicClient } from "viem";
import {
  nodeId,
  type Address,
  type Asset,
  type AssetNode,
  type SourceProvenance,
  type TxStep,
} from "@testnet-router/core";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function edgeId(provider: string, type: string, from: AssetNode, to: AssetNode, suffix?: string): string {
  return `${provider}:${type}:${nodeId(from)}>${nodeId(to)}${suffix ? `:${suffix}` : ""}`;
}

export function runtimeSource(url: string, note?: string): SourceProvenance {
  return { kind: "runtime", url, lastVerifiedAt: new Date().toISOString(), note };
}

export function assetById(assets: Asset[], id: string): Asset {
  const a = assets.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown asset ${id}`);
  return a;
}

export function stepId(edge: string, kind: string): string {
  return `${edge}#${kind}`;
}

/**
 * Exact (never infinite) ERC-20 approval step, only when the current
 * allowance is insufficient. Spender must come from a provider registry.
 */
export async function approvalStepIfNeeded(params: {
  client: PublicClient;
  chainId: number;
  token: Address;
  owner: Address;
  spender: Address;
  amount: bigint;
  provider: string;
  edgeId: string;
  symbol: string;
}): Promise<TxStep | null> {
  const allowance = await params.client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
  if (allowance >= params.amount) return null;
  return {
    id: stepId(params.edgeId, "approve"),
    type: "APPROVE",
    chainId: params.chainId,
    provider: params.provider,
    edgeId: params.edgeId,
    label: `Approve ${params.symbol} (exact amount)`,
    status: "PENDING",
    simulate: true,
    tx: {
      chainId: params.chainId,
      to: params.token,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [params.spender, params.amount] }),
    },
  };
}

export function toBytes32Address(address: Address): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
    public readonly code?: string,
  ) {
    super(HttpError.describe(status, body, code));
  }

  private static describe(status: number, body: string, code?: string): string {
    if (status === 429) return "HTTP 429 rate limited";
    const trimmed = body.trim();
    if (trimmed.startsWith("<")) return `HTTP ${status}`;
    return `HTTP ${status}${code ? ` ${code}` : ""}: ${trimmed.slice(0, 140)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * JSON fetch with timeout, compact error messages and a small backoff retry
 * on 429 / 5xx so a burst of quotes does not immediately fail.
 */
export async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
  timeoutMs = 15_000,
  retries = 2,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let code: string | undefined;
        let message = text;
        try {
          const parsed = JSON.parse(text) as { code?: string; message?: string };
          code = parsed.code;
          if (parsed.message) message = parsed.message;
        } catch {
          // not JSON
        }
        const error = new HttpError(res.status, url, message, code);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          attempt += 1;
          await sleep(400 * 2 ** attempt + Math.random() * 200);
          continue;
        }
        throw error;
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Tiny TTL cache for non-user-specific provider data (fee tables, allowances). */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>();
  constructor(private readonly ttlMs: number) {}

  get(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = loader().catch((err) => {
      this.entries.delete(key);
      throw err;
    });
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
