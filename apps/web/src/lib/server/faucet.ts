import "server-only";
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { toViemChain } from "@testnet-router/core";
import { CHAINS, DRIP_CHAINS, DRIP_COOLDOWN_HOURS, DRIP_DAILY_CAP, findChain } from "@testnet-router/registry";

/**
 * Server side of the RouteDust gas faucet. Protection, in order:
 *   1. Cloudflare Turnstile captcha, verified here (TURNSTILE_SECRET_KEY);
 *   2. the recipient must not already hold the drip amount (checked on-chain);
 *   3. one claim per address AND one per IP (hashed) per chain per cooldown,
 *      reserved atomically (SET NX) before anything is sent;
 *   4. a per-chain daily cap across all addresses;
 *   5. one send at a time per chain (nonce safety across serverless instances).
 * The private key is read from FAUCET_PRIVATE_KEY and never leaves this module.
 */

export interface DripChainStatus {
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  /** Per claim, in native base units (decimal string). */
  amount: string;
  /** Faucet wallet balance, base units; absent when the RPC did not answer. */
  balance?: string;
  /** Enough balance for one more claim including gas. */
  available: boolean;
}

export interface FaucetStatus {
  enabled: boolean;
  /** Configuration still missing on this deployment (names only). */
  missing: string[];
  address?: Address;
  captchaSiteKey?: string;
  cooldownHours: number;
  chains: DripChainStatus[];
}

export type ClaimResult =
  | { ok: true; hash: Hex; chainId: number; amount: string }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number };

const COOLDOWN_S = DRIP_COOLDOWN_HOURS * 3600;
const production = () => process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);

// ---------------------------------------------------------------- configuration

let cachedAccount: { key: string; account: PrivateKeyAccount } | undefined;
function faucetAccount(): PrivateKeyAccount | undefined {
  const key = process.env.FAUCET_PRIVATE_KEY?.trim();
  if (!key) return undefined;
  const normalized = (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) return undefined;
  if (cachedAccount?.key !== normalized) cachedAccount = { key: normalized, account: privateKeyToAccount(normalized) };
  return cachedAccount.account;
}

/** Registry defaults merged with FAUCET_AMOUNTS ("11155111=0.02,84532=0"). */
export function dripAmounts(env: Record<string, string | undefined> = process.env): Map<number, bigint> {
  const human = new Map(DRIP_CHAINS.map((d) => [d.chainId, d.amount]));
  for (const part of (env.FAUCET_AMOUNTS ?? "").split(",")) {
    const [id, value] = part.split("=").map((x) => x.trim());
    if (id && value !== undefined && /^\d+$/.test(id) && /^\d+(\.\d+)?$/.test(value)) human.set(Number(id), value);
  }
  const out = new Map<number, bigint>();
  for (const [chainId, value] of human) {
    const chain = findChain(chainId);
    if (!chain) continue;
    const amount = parseUnits(value, chain.nativeAsset.decimals);
    if (amount > 0n) out.set(chainId, amount);
  }
  return out;
}

function captchaConfig() {
  return { secret: process.env.TURNSTILE_SECRET_KEY?.trim(), siteKey: process.env.TURNSTILE_SITE_KEY?.trim() || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() };
}

function dailyCap(): number {
  const n = Number(process.env.FAUCET_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DRIP_DAILY_CAP;
}

// ---------------------------------------------------------------- claim store

interface Store {
  /** SET key NX EX ttl: true when this call took the key. */
  reserve(key: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
  ttl(key: string): Promise<number>;
  /** INCR with an expiry set on first use. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<void>;
  kind: "redis" | "memory";
}

/** Upstash / Vercel KV over REST (no client library). */
function redisStore(url: string, token: string): Store {
  const call = async <T,>(command: (string | number)[]): Promise<T> => {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
    if (!res.ok) throw new Error(`claim store HTTP ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  };
  return {
    kind: "redis",
    reserve: async (key, ttl) => (await call<string | null>(["SET", key, Date.now(), "NX", "EX", ttl])) === "OK",
    release: async (key) => void (await call(["DEL", key])),
    ttl: async (key) => Number(await call<number>(["TTL", key])),
    incr: async (key, ttl) => {
      const n = Number(await call<number>(["INCR", key]));
      if (n === 1) await call(["EXPIRE", key, ttl]);
      return n;
    },
    decr: async (key) => void (await call(["DECR", key])),
  };
}

/** Development only: forgets everything on restart and is not shared between instances. */
const memory = new Map<string, { value: number; expires: number }>();
const memoryStore: Store = {
  kind: "memory",
  async reserve(key, ttl) {
    const hit = memory.get(key);
    if (hit && hit.expires > Date.now()) return false;
    memory.set(key, { value: Date.now(), expires: Date.now() + ttl * 1000 });
    return true;
  },
  async release(key) {
    memory.delete(key);
  },
  async ttl(key) {
    const hit = memory.get(key);
    return hit && hit.expires > Date.now() ? Math.ceil((hit.expires - Date.now()) / 1000) : -2;
  },
  async incr(key, ttl) {
    const hit = memory.get(key);
    const value = hit && hit.expires > Date.now() ? hit.value + 1 : 1;
    memory.set(key, { value, expires: hit && hit.expires > Date.now() ? hit.expires : Date.now() + ttl * 1000 });
    return value;
  },
  async decr(key) {
    const hit = memory.get(key);
    if (hit) hit.value -= 1;
  },
};

function claimStore(): Store | undefined {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(url, token);
  return production() ? undefined : memoryStore;
}

// ---------------------------------------------------------------- chain access

function publicClient(chainId: number) {
  const chain = findChain(chainId)!;
  return createPublicClient({ chain: toViemChain(chain), transport: http(chain.rpcUrls[0], { timeout: 15_000 }) });
}

/** Gas for a plain value transfer, doubled (covers OP Stack L1 data fees and price moves). */
async function transferGasCost(chainId: number): Promise<bigint> {
  const client = publicClient(chainId);
  let price: bigint;
  try {
    const fees = await client.estimateFeesPerGas();
    price = fees.maxFeePerGas ?? (await client.getGasPrice());
  } catch {
    price = await client.getGasPrice();
  }
  return 21_000n * price * 2n;
}

function configProblems(): string[] {
  const missing: string[] = [];
  if (!faucetAccount()) missing.push("FAUCET_PRIVATE_KEY");
  const captcha = captchaConfig();
  if (!captcha.secret) missing.push("TURNSTILE_SECRET_KEY");
  if (!captcha.siteKey) missing.push("TURNSTILE_SITE_KEY");
  if (!claimStore()) missing.push("KV_REST_API_URL / KV_REST_API_TOKEN");
  return missing;
}

let statusCache: { at: number; status: FaucetStatus } | undefined;

export async function faucetStatus(): Promise<FaucetStatus> {
  if (statusCache && Date.now() - statusCache.at < 30_000) return statusCache.status;
  const missing = configProblems();
  const account = faucetAccount();
  const amounts = dripAmounts();
  const chains = await Promise.all(
    [...amounts.entries()].map(async ([chainId, amount]): Promise<DripChainStatus> => {
      const chain = findChain(chainId)!;
      const base = { chainId, name: chain.name, symbol: chain.nativeAsset.symbol, decimals: chain.nativeAsset.decimals, amount: amount.toString() };
      if (!account) return { ...base, available: false };
      try {
        const [balance, gas] = await Promise.all([publicClient(chainId).getBalance({ address: account.address }), transferGasCost(chainId)]);
        return { ...base, balance: balance.toString(), available: balance >= amount + gas };
      } catch {
        return { ...base, available: false };
      }
    }),
  );
  const status: FaucetStatus = {
    enabled: missing.length === 0,
    missing,
    address: account?.address,
    captchaSiteKey: captchaConfig().siteKey,
    cooldownHours: DRIP_COOLDOWN_HOURS,
    chains,
  };
  statusCache = { at: Date.now(), status };
  return status;
}

// ---------------------------------------------------------------- claim

async function verifyCaptcha(token: string, ip: string | undefined): Promise<boolean> {
  const { secret } = captchaConfig();
  if (!secret || !token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

function ipKey(ip: string): string {
  // Stored hashed: the store never holds raw IP addresses.
  return createHash("sha256").update(`${process.env.FAUCET_IP_SALT ?? "routedust-faucet"}:${ip}`).digest("hex").slice(0, 32);
}

async function withChainLock<T>(store: Store, chainId: number, fn: () => Promise<T>): Promise<T> {
  const key = `drip:${chainId}:lock`;
  for (let i = 0; i < 20; i += 1) {
    if (await store.reserve(key, 30)) {
      try {
        return await fn();
      } finally {
        await store.release(key).catch(() => undefined);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("faucet busy");
}

const fmt = (amount: bigint, chainId: number) => {
  const chain = findChain(chainId)!;
  return `${formatUnits(amount, chain.nativeAsset.decimals)} ${chain.nativeAsset.symbol}`;
};

export async function claimDrip(input: { address: string; chainId: number; captchaToken: string; ip?: string }): Promise<ClaimResult> {
  const missing = configProblems();
  if (missing.length > 0) return { ok: false, status: 503, error: "The faucet is not configured on this deployment" };
  const account = faucetAccount()!;
  const store = claimStore()!;

  if (!isAddress(input.address, { strict: false })) return { ok: false, status: 400, error: "Enter a valid 0x address" };
  const to = getAddress(input.address);
  if (to === account.address || /^0x0{40}$/i.test(to)) return { ok: false, status: 400, error: "That address cannot receive from the faucet" };
  const amount = dripAmounts().get(input.chainId);
  if (!amount || !CHAINS.some((c) => c.id === input.chainId)) return { ok: false, status: 400, error: "This network is not served by the faucet" };
  if (!input.ip) return { ok: false, status: 400, error: "Could not identify the request origin" };

  if (!(await verifyCaptcha(input.captchaToken, input.ip))) return { ok: false, status: 403, error: "Captcha check failed, try again" };

  const client = publicClient(input.chainId);
  const [recipientBalance, faucetBalance, gas] = await Promise.all([client.getBalance({ address: to }), client.getBalance({ address: account.address }), transferGasCost(input.chainId)]);
  if (recipientBalance >= amount) return { ok: false, status: 400, error: `This address already holds ${fmt(recipientBalance, input.chainId)}, at least one drip` };
  if (faucetBalance < amount + gas) return { ok: false, status: 503, error: "The faucet is empty on this network right now" };

  const addrKey = `drip:${input.chainId}:addr:${to.toLowerCase()}`;
  const ipReserveKey = `drip:${input.chainId}:ip:${ipKey(input.ip)}`;
  const dayKey = `drip:${input.chainId}:day:${new Date().toISOString().slice(0, 10)}`;

  if (!(await store.reserve(addrKey, COOLDOWN_S))) {
    return { ok: false, status: 429, error: "This address already claimed on this network", retryAfterSeconds: await store.ttl(addrKey) };
  }
  if (!(await store.reserve(ipReserveKey, COOLDOWN_S))) {
    await store.release(addrKey);
    return { ok: false, status: 429, error: "A claim on this network was already made from your connection", retryAfterSeconds: await store.ttl(ipReserveKey) };
  }
  const used = await store.incr(dayKey, 2 * 86_400);
  const rollback = async () => {
    await Promise.all([store.release(addrKey), store.release(ipReserveKey), store.decr(dayKey)]).catch(() => undefined);
  };
  if (used > dailyCap()) {
    await rollback();
    return { ok: false, status: 429, error: "Today's limit for this network is reached, try again tomorrow" };
  }

  try {
    const chain = findChain(input.chainId)!;
    const wallet = createWalletClient({ account, chain: toViemChain(chain), transport: http(chain.rpcUrls[0], { timeout: 20_000 }) });
    const hash = await withChainLock(store, input.chainId, () => wallet.sendTransaction({ to, value: amount }));
    statusCache = undefined;
    return { ok: true, hash, chainId: input.chainId, amount: amount.toString() };
  } catch (err) {
    await rollback();
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.error(`[faucet] send failed on ${input.chainId}: ${message}`);
    return { ok: false, status: 502, error: message === "faucet busy" ? "The faucet is busy, try again in a moment" : "Sending failed, nothing was used up: try again" };
  }
}
