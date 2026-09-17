import { CCTP_TESTNET_DIRECTORY, CHAINS, COVERAGE_FEEDS, type CctpDirectoryEntry } from "@testnet-router/registry";
import { fetchJson } from "../shared";
import { hasV3Swap, parseUniswapFeed, type UniswapFeedDeployment } from "../uniswap/feed";

/* ---------- raw source shapes ---------- */

export interface ChainidEntry {
  chainId: number;
  name: string;
  shortName?: string;
  nativeCurrency?: { symbol: string; decimals: number; name?: string };
  rpc?: string[];
  faucets?: string[];
  explorers?: { url: string; name?: string }[];
  infoURL?: string;
}

export interface AcrossChainEntry {
  chainId: number;
  name: string;
  spokePool?: string;
  publicRpcUrl?: string;
  explorerUrl?: string;
  inputTokens?: { symbol: string; address: string }[];
}

export interface LifiChainEntry {
  id: number;
  name: string;
  key?: string;
  nativeToken?: { symbol: string };
}

export interface LayerZeroEntry {
  chainKey: string;
  chainDetails?: { nativeChainId?: number; name?: string; chainType?: string; chainStatus?: string };
  deployments?: { version: number; eid: string; stage?: string; endpointV2?: { address: string }; endpoint?: { address: string } }[];
}

export interface HyperlaneChainEntry {
  name: string;
  displayName?: string;
  chainId?: number;
  isTestnet?: boolean;
  protocol?: string;
  rpcUrls?: string[];
}

export interface CoverageSources {
  chainid?: ChainidEntry[];
  uniswap?: Map<number, UniswapFeedDeployment>;
  across?: AcrossChainEntry[];
  lifi?: LifiChainEntry[];
  layerzero?: LayerZeroEntry[];
  hyperlane?: HyperlaneChainEntry[];
}

/* ---------- normalised report ---------- */

export interface CoverageSourceStatus {
  key: keyof CoverageSources | "circle";
  name: string;
  url: string;
  ok: boolean;
  count: number;
  error?: string;
  /** Machine readable at runtime, or a documentation page. */
  kind: "api" | "docs";
}

export interface CoverageChain {
  chainId: number;
  name: string;
  nativeSymbol?: string;
  nativeDecimals?: number;
  rpc: string[];
  faucets: string[];
  explorers: string[];
  inRegistry: boolean;
  isTestnet: boolean;
  providers: {
    circle?: { domain: number; fastTransfer?: boolean; note?: string; chainIdConfidence: "verified" | "assumed" };
    uniswap?: { v3: boolean; v4: boolean; tier?: string; factory?: string; quoterV2?: string; swapRouter02?: string };
    across?: { spokePool?: string; tokens: string[] };
    lifi?: { name: string };
    layerzero?: { chainKey: string; eid: string; endpoint?: string };
    hyperlane?: { name: string; displayName?: string };
  };
  /** Number of providers that support this chain. */
  score: number;
}

export interface CoverageReport {
  generatedAt: number;
  sources: CoverageSourceStatus[];
  chains: CoverageChain[];
  /** Circle entries that could not be mapped to an EVM chain id (non-EVM or unresolved). */
  circleUnmapped: { name: string; domain: number; vm: string }[];
}

const TESTNET_RE = /testnet|sepolia|fuji|amoy|devnet|hoodi|holesky|apothem|blaze|minato|chiado|atlantic|hoodie/i;

/** Tiny parser for Hyperlane's chains/metadata.yaml (top-level entries with flat scalar fields). */
export function parseHyperlaneMetadata(yaml: string): HyperlaneChainEntry[] {
  const out: HyperlaneChainEntry[] = [];
  let current: HyperlaneChainEntry | undefined;
  for (const raw of yaml.split(/\r?\n/)) {
    const top = raw.match(/^([a-z0-9]+):\s*$/);
    if (top?.[1]) {
      current = { name: top[1] };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const field = raw.match(/^  ([a-zA-Z]+):\s*(.+?)\s*$/);
    if (!field) continue;
    const [, key, value] = field;
    if (key === "chainId") current.chainId = Number(value);
    else if (key === "displayName") current.displayName = value?.replace(/^["']|["']$/g, "");
    else if (key === "isTestnet") current.isTestnet = value === "true";
    else if (key === "protocol") current.protocol = value;
  }
  return out;
}

function matchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.every((k) => lower.includes(k));
}

/** Pure aggregation: union of provider testnets + registry chains, enriched with chainid.network metadata. */
export function buildCoverage(
  sources: CoverageSources,
  statuses: CoverageSourceStatus[],
  options: { registryChainIds?: number[]; cctpDirectory?: CctpDirectoryEntry[]; now?: number } = {},
): CoverageReport {
  const registryIds = new Set(options.registryChainIds ?? CHAINS.map((c) => c.id));
  const directory = options.cctpDirectory ?? CCTP_TESTNET_DIRECTORY;
  const chainidById = new Map<number, ChainidEntry>();
  for (const c of sources.chainid ?? []) chainidById.set(c.chainId, c);

  const chains = new Map<number, CoverageChain>();
  const ensure = (chainId: number, fallbackName?: string): CoverageChain => {
    let c = chains.get(chainId);
    if (c) return c;
    const meta = chainidById.get(chainId);
    c = {
      chainId,
      name: meta?.name ?? fallbackName ?? `Chain ${chainId}`,
      nativeSymbol: meta?.nativeCurrency?.symbol,
      nativeDecimals: meta?.nativeCurrency?.decimals,
      rpc: (meta?.rpc ?? []).filter((u) => /^https:\/\//.test(u) && !u.includes("${")),
      faucets: meta?.faucets ?? [],
      explorers: (meta?.explorers ?? []).map((e) => e.url),
      inRegistry: registryIds.has(chainId),
      isTestnet: registryIds.has(chainId) || TESTNET_RE.test(meta?.name ?? fallbackName ?? ""),
      providers: {},
      score: 0,
    };
    chains.set(chainId, c);
    return c;
  };

  for (const id of registryIds) ensure(id);

  // Circle: static directory, chain ids cross-checked against chainid.network names.
  const circleUnmapped: CoverageReport["circleUnmapped"] = [];
  for (const entry of directory) {
    if (entry.vm !== "EVM" || entry.chainId === undefined) {
      circleUnmapped.push({ name: entry.name, domain: entry.domain, vm: entry.vm });
      continue;
    }
    const meta = chainidById.get(entry.chainId);
    let confidence = entry.chainIdConfidence;
    if (confidence === "assumed" && meta && matchesKeywords(meta.name, entry.keywords)) confidence = "verified";
    if (confidence === "assumed" && meta && !matchesKeywords(meta.name, entry.keywords)) {
      circleUnmapped.push({ name: `${entry.name} (chain id ${entry.chainId} did not match "${meta.name}")`, domain: entry.domain, vm: entry.vm });
      continue;
    }
    const c = ensure(entry.chainId, entry.name);
    c.isTestnet = true;
    c.providers.circle = { domain: entry.domain, fastTransfer: entry.fastTransfer, note: entry.note, chainIdConfidence: confidence };
  }

  for (const [chainId, d] of sources.uniswap ?? []) {
    const meta = chainidById.get(chainId);
    const name = meta?.name ?? d.chainName;
    if (!registryIds.has(chainId) && !TESTNET_RE.test(name)) continue;
    const c = ensure(chainId, d.chainName);
    c.providers.uniswap = { v3: hasV3Swap(d), v4: Boolean(d.v4PoolManager), tier: d.tier, factory: d.factory, quoterV2: d.quoterV2, swapRouter02: d.swapRouter02 };
  }

  for (const a of sources.across ?? []) {
    if (!Number.isFinite(a.chainId) || a.chainId > 2 ** 40) continue; // skip non-EVM pseudo ids
    const c = ensure(a.chainId, a.name);
    c.isTestnet = true;
    c.providers.across = { spokePool: a.spokePool, tokens: [...new Set((a.inputTokens ?? []).map((t) => t.symbol))] };
  }

  for (const l of sources.lifi ?? []) {
    if (!registryIds.has(l.id) && !TESTNET_RE.test(l.name)) continue;
    const c = ensure(l.id, l.name);
    c.providers.lifi = { name: l.name };
  }

  for (const e of sources.layerzero ?? []) {
    const d = e.chainDetails;
    if (!d || d.chainType !== "evm" || !d.nativeChainId || d.chainStatus !== "ACTIVE") continue;
    if (!/testnet/i.test(e.chainKey)) continue;
    const v2 = (e.deployments ?? []).find((x) => x.version === 2 && (x.endpointV2?.address || x.endpoint?.address));
    if (!v2) continue;
    if (!registryIds.has(d.nativeChainId) && !chainidById.has(d.nativeChainId)) continue; // unknown / private testnets
    const c = ensure(d.nativeChainId, d.name);
    c.isTestnet = true;
    c.providers.layerzero = { chainKey: e.chainKey, eid: v2.eid, endpoint: v2.endpointV2?.address ?? v2.endpoint?.address };
  }

  for (const h of sources.hyperlane ?? []) {
    if (!h.chainId || h.protocol !== "ethereum" || !h.isTestnet) continue;
    if (!registryIds.has(h.chainId) && !chainidById.has(h.chainId)) continue;
    const c = ensure(h.chainId, h.displayName ?? h.name);
    c.isTestnet = true;
    c.providers.hyperlane = { name: h.name, displayName: h.displayName };
  }

  const list = [...chains.values()]
    .filter((c) => c.isTestnet)
    .map((c) => ({ ...c, score: Object.keys(c.providers).length }))
    .sort((a, b) => Number(b.inRegistry) - Number(a.inRegistry) || b.score - a.score || a.name.localeCompare(b.name));

  return { generatedAt: options.now ?? Date.now(), sources: statuses, chains: list, circleUnmapped };
}

/* ---------- fetching ---------- */

export interface FetchCoverageOptions {
  /** Override feed URLs (e.g. same-origin proxies). */
  feeds?: Partial<Record<"chainid" | "uniswap" | "across" | "lifi" | "layerzero" | "hyperlane", string>>;
  timeoutMs?: number;
}

async function load<T>(
  key: CoverageSourceStatus["key"],
  name: string,
  url: string,
  loader: () => Promise<{ value: T; count: number }>,
  statuses: CoverageSourceStatus[],
): Promise<T | undefined> {
  try {
    const { value, count } = await loader();
    statuses.push({ key, name, url, ok: true, count, kind: "api" });
    return value;
  } catch (err) {
    statuses.push({ key, name, url, ok: false, count: 0, kind: "api", error: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

/** Fetches every registry feed in parallel and builds the report. A failing feed never fails the report. */
export async function fetchCoverage(fetchImpl: typeof fetch, options: FetchCoverageOptions = {}): Promise<CoverageReport> {
  const urls = { ...COVERAGE_FEEDS, ...(options.feeds ?? {}) };
  const timeout = options.timeoutMs ?? 30_000;
  const statuses: CoverageSourceStatus[] = [];
  const [chainid, uniswap, across, lifi, layerzero, hyperlane] = await Promise.all([
    load("chainid", "chainid.network", urls.chainid, async () => {
      const value = await fetchJson<ChainidEntry[]>(fetchImpl, urls.chainid, undefined, timeout);
      return { value, count: value.length };
    }, statuses),
    load("uniswap", "Uniswap deployments feed", urls.uniswap, async () => {
      const value = parseUniswapFeed(await fetchJson<unknown>(fetchImpl, urls.uniswap, undefined, timeout)).deployments;
      return { value, count: value.size };
    }, statuses),
    load("across", "Across testnet API", urls.across, async () => {
      const value = await fetchJson<AcrossChainEntry[]>(fetchImpl, urls.across, undefined, timeout);
      return { value, count: value.length };
    }, statuses),
    load("lifi", "LI.FI chains", urls.lifi, async () => {
      const value = (await fetchJson<{ chains: LifiChainEntry[] }>(fetchImpl, urls.lifi, undefined, timeout)).chains;
      return { value, count: value.length };
    }, statuses),
    load("layerzero", "LayerZero metadata", urls.layerzero, async () => {
      const raw = await fetchJson<Record<string, LayerZeroEntry>>(fetchImpl, urls.layerzero, undefined, timeout);
      const value = Object.values(raw);
      return { value, count: value.length };
    }, statuses),
    load("hyperlane", "Hyperlane registry", urls.hyperlane, async () => {
      const res = await fetchImpl(urls.hyperlane);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = parseHyperlaneMetadata(await res.text());
      return { value, count: value.length };
    }, statuses),
  ]);
  statuses.push({ key: "circle", name: "Circle CCTP supported chains", url: COVERAGE_FEEDS.circleDocs, ok: true, count: CCTP_TESTNET_DIRECTORY.length, kind: "docs" });
  return buildCoverage({ chainid, uniswap, across, lifi, layerzero, hyperlane }, statuses);
}
