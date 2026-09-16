import type { PublicClient } from "viem";
import { QuoteLimitError } from "../errors";
import { formatAmount } from "../format/amounts";
import { APPROVAL_GAS_UNITS, computeGasReserve, usableNative } from "../gas/reserve";
import { CapabilityGraph, nodeFromAsset, pathSearchOptions, sameNode, type CapabilityPath } from "../graph/multigraph";
import { nativeBalanceOf } from "../scanner/scanner";
import { scoreCandidates, selectBest } from "../scoring/score";
import type { Asset, AssetBalance, AssetNode, WalletScan } from "../types/asset";
import type { ChainConfig, FaucetRef } from "../types/chain";
import type { Address } from "../types/common";
import type { ClientResolver, RouteProvider } from "../types/provider";
import {
  DEFAULT_PLANNER_LIMITS,
  type CapabilityEdge,
  type ConsolidationPlan,
  type EdgeHealth,
  type GasReserveInfo,
  type NoRouteReason,
  type OutputCanonicality,
  type PlannerLimits,
  type ReliabilityClass,
  type RouteCandidate,
  type RouteEdge,
  type RouteMode,
  type SourcePlan,
} from "../types/route";

export interface PlannerProgress {
  phase: "start" | "source" | "done";
  sourceId?: string;
  message: string;
  completed?: number;
  total?: number;
}

export interface PlannerInput {
  wallet: Address;
  recipient?: Address;
  scan: WalletScan;
  destination: AssetNode;
  mode: RouteMode;
  limits?: Partial<PlannerLimits>;
  graph: CapabilityGraph;
  providers: RouteProvider[];
  clients: ClientResolver;
  assets: Asset[];
  chains: ChainConfig[];
  fetch?: typeof fetch;
  now?: number;
  onProgress?: (event: PlannerProgress) => void;
  /** Max sources quoted concurrently. */
  concurrency?: number;
}

const HEALTH_RANK: Record<EdgeHealth, number> = {
  UNAVAILABLE: 0,
  DEGRADED: 1,
  STRUCTURAL: 2,
  QUOTED: 3,
  SIMULATED: 4,
};

const CANON_RANK: Record<OutputCanonicality, number> = {
  NATIVE: 0,
  CANONICAL: 1,
  ISSUER_MANAGED: 2,
  WRAPPED: 3,
};

const RELIABILITY_RANK: Record<ReliabilityClass, number> = {
  CANONICAL: 0,
  ISSUER: 1,
  LIQUIDITY: 2,
  BEST_EFFORT_TESTNET: 3,
};

function minHealth(edges: RouteEdge[]): EdgeHealth {
  let worst: EdgeHealth = "SIMULATED";
  for (const e of edges) if (HEALTH_RANK[e.health] < HEALTH_RANK[worst]) worst = e.health;
  return worst;
}

function worstCanonicality(edges: CapabilityEdge[]): OutputCanonicality {
  const last = edges[edges.length - 1];
  return last ? last.outputCanonicality : "CANONICAL";
}

function worstReliability(edges: CapabilityEdge[]): ReliabilityClass {
  let worst: ReliabilityClass = "CANONICAL";
  for (const e of edges) if (RELIABILITY_RANK[e.reliabilityClass] > RELIABILITY_RANK[worst]) worst = e.reliabilityClass;
  return worst;
}

/** Gas units per chain that the user must pay for along a path (source-side txs + claims). */
export function gasUnitsByChain(path: CapabilityEdge[], quoted?: RouteEdge[]): Map<number, bigint> {
  const map = new Map<number, bigint>();
  const add = (chainId: number, units: bigint) => map.set(chainId, (map.get(chainId) ?? 0n) + units);
  path.forEach((edge, i) => {
    const units = quoted?.[i]?.quote.estimatedGasUnits ?? edge.baselineGasUnits;
    add(edge.from.chainId, units + (edge.requiresApproval ? APPROVAL_GAS_UNITS : 0n));
    if (edge.requiresDestinationGas) add(edge.to.chainId, 150_000n);
  });
  return map;
}

async function feePerGas(client: PublicClient): Promise<bigint> {
  try {
    const fees = await client.estimateFeesPerGas();
    if (fees.maxFeePerGas && fees.maxFeePerGas > 0n) return fees.maxFeePerGas;
  } catch {
    // fall through to legacy gas price
  }
  try {
    const price = await client.getGasPrice();
    return (price * 12n) / 10n;
  } catch {
    return 1_000_000_000n; // 1 gwei fallback so planning can still proceed
  }
}

class FeeCache {
  private readonly cache = new Map<number, Promise<bigint>>();
  constructor(private readonly clients: ClientResolver) {}
  get(chainId: number): Promise<bigint> {
    let p = this.cache.get(chainId);
    if (!p) {
      p = feePerGas(this.clients.get(chainId));
      this.cache.set(chainId, p);
    }
    return p;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

function faucetsFor(chain: ChainConfig | undefined, assetId: string): FaucetRef[] {
  if (!chain) return [];
  return chain.faucets.filter((f) => f.assetId === assetId || f.assetId === "*");
}

function candidateId(sourceAssetId: string, path: CapabilityEdge[]): string {
  return `${sourceAssetId}|${path.map((e) => e.id).join(">")}`;
}

function structuralPriority(path: CapabilityPath): number {
  return path.length * 10 + RELIABILITY_RANK[worstReliability(path)] + CANON_RANK[worstCanonicality(path)];
}

interface QuoteFailure {
  edge: CapabilityEdge;
  reason: string;
  path: CapabilityPath;
  /** Source amount that would satisfy a provider limit reported on this path. */
  limitedSourceAmount?: bigint;
}

type QuoteOutcome = { edge: RouteEdge } | { reason: string; maxAmountIn?: bigint };

/** Memoises provider quotes per (edge, amount) for the duration of one planning run. */
class QuoteCache {
  private readonly cache = new Map<string, Promise<QuoteOutcome>>();

  constructor(
    private readonly input: PlannerInput,
    private readonly providers: Map<string, RouteProvider>,
    private readonly limits: PlannerLimits,
    private readonly fetchImpl: typeof fetch,
    private readonly now: number,
  ) {}

  get(edge: CapabilityEdge, amountIn: bigint): Promise<QuoteOutcome> {
    const key = `${edge.id}|${amountIn}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.fetch(edge, amountIn);
      this.cache.set(key, p);
    }
    return p;
  }

  private async fetch(edge: CapabilityEdge, amountIn: bigint): Promise<QuoteOutcome> {
    const provider = this.providers.get(edge.provider);
    if (!provider) return { reason: `provider ${edge.provider} not registered` };
    try {
      const quoted = await provider.quote({
        edge,
        amountIn,
        wallet: this.input.wallet,
        recipient: this.input.recipient ?? this.input.wallet,
        slippageBps: this.limits.slippageBps,
        clients: this.input.clients,
        fetch: this.fetchImpl,
        assets: this.input.assets,
        now: this.now,
      });
      if (!quoted || quoted.quote.amountOut <= 0n) return { reason: "no quote" };
      return { edge: quoted };
    } catch (err) {
      if (err instanceof QuoteLimitError) return { reason: compactError(err), maxAmountIn: err.maxAmountIn };
      return { reason: compactError(err) };
    }
  }
}

function compactError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").slice(0, 160);
}

async function quotePath(path: CapabilityPath, amountIn: bigint, quotes: QuoteCache): Promise<{ edges: RouteEdge[] } | QuoteFailure> {
  const edges: RouteEdge[] = [];
  let amount = amountIn;
  for (const edge of path) {
    const outcome = await quotes.get(edge, amount);
    if ("reason" in outcome) {
      const failure: QuoteFailure = { edge, reason: outcome.reason, path };
      if (outcome.maxAmountIn !== undefined && outcome.maxAmountIn > 0n && amount > 0n) {
        // Back-solve the source amount that lands `maxAmountIn` on this edge,
        // with a 1% margin for quote drift on the hops before it.
        failure.limitedSourceAmount = (amountIn * outcome.maxAmountIn * 99n) / (amount * 100n);
      }
      return failure;
    }
    edges.push(outcome.edge);
    amount = outcome.edge.quote.amountOut;
  }
  return { edges };
}

function pathKey(path: CapabilityPath): string {
  return path.map((e) => e.id).join(">");
}

/** Assembles a RouteCandidate from a fully quoted edge chain. */
export function assembleCandidate(
  sourceAsset: Asset,
  amountIn: bigint,
  destination: AssetNode,
  edges: RouteEdge[],
): RouteCandidate {
  const gasByChain = gasUnitsByChain(edges, edges);
  const last = edges[edges.length - 1];
  const amountOut = last ? last.quote.amountOut : 0n;
  // Propagate minimum output through the chain proportionally.
  let minOut = amountIn;
  for (const e of edges) {
    minOut = e.quote.amountIn > 0n ? (e.quote.minAmountOut * minOut) / e.quote.amountIn : e.quote.minAmountOut;
  }
  return {
    id: candidateId(sourceAsset.id, edges),
    sourceChainId: sourceAsset.chainId,
    sourceAsset,
    amountIn,
    destination,
    edges,
    amountOut,
    minAmountOut: minOut < amountOut ? minOut : amountOut,
    txCount: edges.reduce((n, e) => n + e.quote.txCount + (e.requiresApproval ? 1 : 0), 0),
    swapCount: edges.filter((e) => e.type === "SWAP").length,
    bridgeCount: edges.filter((e) => e.crossChain).length,
    estimatedSeconds: edges.reduce((n, e) => n + e.quote.estimatedSeconds, 0),
    sourceGasUnits: gasByChain.get(sourceAsset.chainId) ?? 0n,
    outputCanonicality: worstCanonicality(edges),
    reliabilityClass: worstReliability(edges),
    requiresSourceGas: true,
    requiresDestinationGas: edges.some((e) => e.requiresDestinationGas),
    health: minHealth(edges),
  };
}

async function planSource(
  balance: AssetBalance,
  input: PlannerInput,
  limits: PlannerLimits,
  fees: FeeCache,
  quotes: QuoteCache,
): Promise<SourcePlan> {
  const asset = balance.asset;
  const chain = input.chains.find((c) => c.id === asset.chainId);
  const node = nodeFromAsset(asset);
  const nativeBalance = nativeBalanceOf(input.scan, asset.chainId);
  const notes: string[] = [];
  const emptyGas: GasReserveInfo = {
    nativeBalance,
    reserve: 0n,
    shortfall: 0n,
    estimatedGasUnits: 0n,
    maxFeePerGas: 0n,
    safetyMultiplier: limits.gasSafetyMultiplier,
  };
  const base = {
    id: `${asset.id}`,
    sourceChainId: asset.chainId,
    asset,
    balance: balance.raw,
    routable: 0n,
    gas: emptyGas,
    candidates: [] as RouteCandidate[],
    faucets: faucetsFor(chain, chain?.nativeAsset.canonicalAssetId ?? ""),
    notes,
  };

  if (sameNode(node, input.destination)) {
    return { ...base, status: "TARGET", reason: "ALREADY_AT_TARGET", routable: balance.raw };
  }
  const dust = limits.dustThresholds?.[asset.id];
  if (dust !== undefined && balance.raw < dust) {
    return { ...base, status: "SKIPPED", reason: "BELOW_DUST_THRESHOLD" };
  }
  if (!asset.verified) {
    return { ...base, status: "NO_ROUTE", reason: "UNVERIFIED_ASSET" };
  }
  if (!input.graph.hasNode(node)) {
    return { ...base, status: "NO_ROUTE", reason: "NO_BRIDGE_FOR_ASSET" };
  }

  const searchOptions = pathSearchOptions(limits);
  const sortPaths = (paths: CapabilityPath[]) => [...paths].sort((a, b) => structuralPriority(a) - structuralPriority(b));
  const allPaths = sortPaths(input.graph.findPaths(node, input.destination, searchOptions));

  if (allPaths.length === 0) {
    return { ...base, status: "NO_ROUTE", reason: "NO_STRUCTURAL_PATH" };
  }

  const maxFeePerGas = await fees.get(asset.chainId);
  const candidates: RouteCandidate[] = [];
  const failures: QuoteFailure[] = [];
  const tried = new Set<string>();
  let bestGas: GasReserveInfo = emptyGas;
  let gasShortfall = false;
  let intermediateGasIssue = false;

  /** Quotes a set of structural paths, collecting candidates and failures. */
  const tryPaths = async (paths: CapabilityPath[]): Promise<void> => {
  for (const path of paths) {
    if (candidates.length >= limits.maxCandidatesPerAsset) return;
    const key = pathKey(path);
    if (tried.has(key)) continue;
    tried.add(key);
    const baselineByChain = gasUnitsByChain(path);
    const sourceUnits = baselineByChain.get(asset.chainId) ?? 0n;
    const gas = computeGasReserve({
      nativeBalance,
      estimatedGasUnits: sourceUnits,
      maxFeePerGas,
      safetyMultiplier: limits.gasSafetyMultiplier,
    });

    let amountIn: bigint;
    if (asset.kind === "NATIVE") {
      amountIn = usableNative(gas);
    } else {
      amountIn = balance.raw;
    }
    if (gas.shortfall > 0n || amountIn <= 0n) {
      gasShortfall = true;
      if (bestGas.estimatedGasUnits === 0n || gas.reserve < bestGas.reserve) bestGas = gas;
      continue;
    }

    // Other chains along the path (intermediate hops, destination claims) also need gas.
    let otherChainsOk = true;
    for (const [chainId, units] of baselineByChain) {
      if (chainId === asset.chainId) continue;
      const otherFee = await fees.get(chainId);
      const otherGas = computeGasReserve({
        nativeBalance: nativeBalanceOf(input.scan, chainId),
        estimatedGasUnits: units,
        maxFeePerGas: otherFee,
        safetyMultiplier: limits.gasSafetyMultiplier,
      });
      if (otherGas.shortfall > 0n) {
        otherChainsOk = false;
        const otherChain = input.chains.find((c) => c.id === chainId);
        notes.push(`Path skipped: needs gas on ${otherChain?.name ?? chainId}`);
        break;
      }
    }
    if (!otherChainsOk) {
      intermediateGasIssue = true;
      continue;
    }

    let result = await quotePath(path, amountIn, quotes);
    if ("reason" in result) {
      failures.push(result);
      continue;
    }
    let candidate = assembleCandidate(asset, amountIn, input.destination, result.edges);
    // Recompute the reserve with quoted gas; keep the tightest valid one.
    let quotedGas = computeGasReserve({
      nativeBalance,
      estimatedGasUnits: candidate.sourceGasUnits,
      maxFeePerGas,
      safetyMultiplier: limits.gasSafetyMultiplier,
    });
    if (asset.kind === "NATIVE" && amountIn + quotedGas.reserve > nativeBalance) {
      // Quoted gas exceeded the baseline reserve: shrink the input and re-quote once.
      const cap = nativeBalance - quotedGas.reserve;
      if (cap <= 0n) {
        gasShortfall = true;
        bestGas = quotedGas;
        continue;
      }
      result = await quotePath(path, cap, quotes);
      if ("reason" in result) {
        failures.push(result);
        continue;
      }
      candidate = assembleCandidate(asset, cap, input.destination, result.edges);
      quotedGas = computeGasReserve({
        nativeBalance,
        estimatedGasUnits: candidate.sourceGasUnits,
        maxFeePerGas,
        safetyMultiplier: limits.gasSafetyMultiplier,
      });
      notes.push(
        `Gas reserve raised after quote: routing ${formatAmount(cap, asset.decimals)} instead of ${formatAmount(amountIn, asset.decimals)} ${asset.symbol}`,
      );
    }
    if (bestGas.estimatedGasUnits === 0n || quotedGas.reserve > bestGas.reserve) bestGas = quotedGas;
    candidates.push(candidate);
  }
  };

  // Stage 1: short paths. Long detours only get quoted when nothing short works.
  const shortest = allPaths[0]?.length ?? 1;
  const maxLength = shortest + (limits.experimentalRoutes ? 3 : 1);
  await tryPaths(allPaths.filter((p) => p.length <= maxLength).slice(0, limits.maxCandidatesPerAsset * 2));

  // Stage 2: multi-hop detours through other chains (first X, then Y, then the target).
  if (candidates.length === 0) {
    const longer = allPaths.filter((p) => p.length > maxLength);
    if (longer.length > 0) {
      notes.push(`No short path quoted; trying ${Math.min(longer.length, limits.maxCandidatesPerAsset)} multi-hop detours`);
      await tryPaths(longer.slice(0, limits.maxCandidatesPerAsset));
    }
  }

  // Stage 3: bridge-after-bridge relays via an intermediate chain.
  if (candidates.length === 0 && !limits.experimentalRoutes) {
    const relays = sortPaths(input.graph.findPaths(node, input.destination, { ...searchOptions, allowBridgeRelay: true })).filter(
      (p) => !tried.has(pathKey(p)),
    );
    if (relays.length > 0) {
      notes.push(`Trying ${Math.min(relays.length, limits.maxCandidatesPerAsset)} relay paths through intermediate chains`);
      await tryPaths(relays.slice(0, limits.maxCandidatesPerAsset));
    }
  }

  // Stage 4: a provider reported a hard cap: route the part it can take right now.
  let partialLimit: SourcePlan["limit"] | undefined;
  if (candidates.length === 0) {
    const limited = failures
      .filter((f): f is QuoteFailure & { limitedSourceAmount: bigint } => f.limitedSourceAmount !== undefined && f.limitedSourceAmount > 0n)
      .sort((a, b) => (b.limitedSourceAmount > a.limitedSourceAmount ? 1 : b.limitedSourceAmount < a.limitedSourceAmount ? -1 : 0));
    for (const f of limited.slice(0, 3)) {
      const result = await quotePath(f.path, f.limitedSourceAmount, quotes);
      if ("reason" in result) continue;
      candidates.push(assembleCandidate(asset, f.limitedSourceAmount, input.destination, result.edges));
      partialLimit = { maxAmountIn: f.limitedSourceAmount, provider: f.edge.provider, edgeType: f.edge.type };
      notes.push(
        `${f.edge.type}/${f.edge.provider} can take at most ${formatAmount(f.limitedSourceAmount, asset.decimals)} ${asset.symbol} right now; routing that part`,
      );
      break;
    }
  }

  const seenNotes = new Set<string>();
  for (const f of failures) {
    const note = `${f.edge.type}/${f.edge.provider}: ${f.reason}`;
    if (seenNotes.has(note)) continue;
    seenNotes.add(note);
    notes.push(note);
  }

  if (candidates.length === 0) {
    if (gasShortfall && failures.length === 0) {
      return { ...base, status: "NEED_GAS", reason: "INSUFFICIENT_SOURCE_GAS", gas: bestGas };
    }
    let reason: NoRouteReason = "PROVIDER_UNAVAILABLE";
    if (failures.some((f) => f.edge.type === "SWAP" || /liquidity/i.test(f.reason))) reason = "NO_LIQUIDITY";
    else if (failures.some((f) => /minimum|too small|below/i.test(f.reason))) reason = "AMOUNT_BELOW_MINIMUM";
    else if (intermediateGasIssue) reason = "INSUFFICIENT_SOURCE_GAS";
    return { ...base, status: gasShortfall ? "NEED_GAS" : "NO_ROUTE", reason, gas: bestGas };
  }

  const scored = scoreCandidates(candidates, input.mode, limits);
  const selected = selectBest(scored);
  let selectedGas = selected
    ? computeGasReserve({
        nativeBalance,
        estimatedGasUnits: selected.sourceGasUnits,
        maxFeePerGas,
        safetyMultiplier: limits.gasSafetyMultiplier,
      })
    : bestGas;
  if (selected && asset.kind === "NATIVE" && !partialLimit) {
    // Report the reserve actually held back so found = reserved + routable.
    // (Not for PARTIAL plans: there the remainder is capped by a provider, not by gas.)
    selectedGas = { ...selectedGas, reserve: nativeBalance - selected.amountIn, shortfall: 0n };
  }

  if (!selected) {
    const blocked = scored.every((c) => c.excludedBy === "NATIVE_ONLY" || c.excludedBy === "WRAPPED_OUTPUT_DISABLED");
    return {
      ...base,
      status: "NO_ROUTE",
      reason: blocked ? "OUTPUT_IS_WRAPPED_AND_BLOCKED" : "PROVIDER_UNAVAILABLE",
      candidates: scored,
      gas: selectedGas,
    };
  }

  return {
    ...base,
    status: partialLimit ? "PARTIAL" : "ROUTABLE",
    routable: selected.amountIn,
    gas: selectedGas,
    candidates: scored,
    selected,
    limit: partialLimit,
  };
}

/**
 * Plans a wallet-wide consolidation towards a destination node.
 * Never manufactures a route: every candidate has a live quote per edge.
 */
export async function planConsolidation(input: PlannerInput): Promise<ConsolidationPlan> {
  const limits: PlannerLimits = { ...DEFAULT_PLANNER_LIMITS, ...(input.limits ?? {}) };
  if (input.mode === "NATIVE_ONLY") limits.allowWrappedOutput = false;
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now();
  const providers = new Map(input.providers.map((p) => [p.key, p] as const));
  const fees = new FeeCache(input.clients);
  const quotes = new QuoteCache(input, providers, limits, fetchImpl, now);

  const balances = input.scan.chains.flatMap((c) => c.balances.filter((b) => b.raw > 0n));
  input.onProgress?.({ phase: "start", message: `Planning ${balances.length} balances`, total: balances.length, completed: 0 });

  let completed = 0;
  const sources = await mapLimit(balances, input.concurrency ?? 4, async (balance) => {
    input.onProgress?.({
      phase: "source",
      sourceId: balance.asset.id,
      message: `Quoting ${balance.asset.symbol} on chain ${balance.asset.chainId}`,
      completed,
      total: balances.length,
    });
    const plan = await planSource(balance, input, limits, fees, quotes);
    completed += 1;
    input.onProgress?.({
      phase: "source",
      sourceId: balance.asset.id,
      message: `${balance.asset.symbol}: ${plan.status}`,
      completed,
      total: balances.length,
    });
    return plan;
  });

  const ordered = [...sources].sort((a, b) => {
    const rank = (s: SourcePlan) => ({ ROUTABLE: 0, PARTIAL: 1, NEED_GAS: 2, TARGET: 3, NO_ROUTE: 4, SKIPPED: 5 })[s.status];
    return rank(a) - rank(b);
  });
  const totalOut = ordered.reduce((acc, s) => acc + (s.selected?.amountOut ?? 0n), 0n);
  const networks = new Set(input.scan.chains.filter((c) => c.ok).map((c) => c.chainId)).size;

  const plan: ConsolidationPlan = {
    id: `plan_${now.toString(36)}`,
    wallet: input.wallet,
    destination: input.destination,
    mode: input.mode,
    createdAt: now,
    sources: ordered,
    totalOut,
    stats: {
      networks,
      assets: ordered.length,
      routable: ordered.filter((s) => s.status === "ROUTABLE" || s.status === "PARTIAL").length,
      needGas: ordered.filter((s) => s.status === "NEED_GAS").length,
      noRoute: ordered.filter((s) => s.status === "NO_ROUTE").length,
      target: ordered.filter((s) => s.status === "TARGET").length,
    },
  };
  input.onProgress?.({ phase: "done", message: "Plan ready", completed: balances.length, total: balances.length });
  return plan;
}

export interface RequoteInput {
  candidate: RouteCandidate;
  amountIn: bigint;
  providers: RouteProvider[];
  clients: ClientResolver;
  assets: Asset[];
  wallet: Address;
  recipient?: Address;
  slippageBps?: number;
  fetch?: typeof fetch;
  now?: number;
}

/**
 * Re-quotes an existing candidate path for a different input amount (user
 * picked a percentage or a custom amount). The path is kept; every edge gets
 * a fresh live quote. Returns an error instead of a manufactured estimate.
 */
export async function requoteCandidate(input: RequoteInput): Promise<{ candidate: RouteCandidate } | { error: string }> {
  if (input.amountIn <= 0n) return { error: "amount must be greater than zero" };
  const providers = new Map(input.providers.map((p) => [p.key, p] as const));
  const now = input.now ?? Date.now();
  const edges: RouteEdge[] = [];
  let amount = input.amountIn;
  for (const edge of input.candidate.edges) {
    const provider = providers.get(edge.provider);
    if (!provider) return { error: `provider ${edge.provider} not registered` };
    try {
      const quoted = await provider.quote({
        edge,
        amountIn: amount,
        wallet: input.wallet,
        recipient: input.recipient ?? input.wallet,
        slippageBps: input.slippageBps ?? DEFAULT_PLANNER_LIMITS.slippageBps,
        clients: input.clients,
        fetch: input.fetch ?? globalThis.fetch,
        assets: input.assets,
        now,
      });
      if (!quoted || quoted.quote.amountOut <= 0n) return { error: `${edge.type}/${edge.provider}: no quote for this amount` };
      edges.push(quoted);
      amount = quoted.quote.amountOut;
    } catch (err) {
      return { error: `${edge.type}/${edge.provider}: ${compactError(err)}` };
    }
  }
  const fresh = assembleCandidate(input.candidate.sourceAsset, input.amountIn, input.candidate.destination, edges);
  return {
    candidate: {
      ...fresh,
      id: input.candidate.id,
      score: input.candidate.score,
      scoreBreakdown: input.candidate.scoreBreakdown,
      excludedBy: input.candidate.excludedBy,
    },
  };
}

/** Re-scores an existing plan under a different mode without re-quoting. */
export function rescorePlan(plan: ConsolidationPlan, mode: RouteMode, limits?: Partial<PlannerLimits>): ConsolidationPlan {
  const merged: PlannerLimits = { ...DEFAULT_PLANNER_LIMITS, ...(limits ?? {}) };
  if (mode === "NATIVE_ONLY") merged.allowWrappedOutput = false;
  const sources = plan.sources.map((s) => {
    if (s.candidates.length === 0) return s;
    const scored = scoreCandidates(
      s.candidates.map((c) => ({ ...c })),
      mode,
      merged,
    );
    const selected = selectBest(scored);
    return {
      ...s,
      candidates: scored,
      selected,
      status: selected ? "ROUTABLE" : s.status === "ROUTABLE" ? "NO_ROUTE" : s.status,
      reason: selected ? undefined : "OUTPUT_IS_WRAPPED_AND_BLOCKED",
      routable: selected?.amountIn ?? 0n,
    } satisfies SourcePlan;
  });
  const totalOut = sources.reduce((acc, s) => acc + (s.selected?.amountOut ?? 0n), 0n);
  return {
    ...plan,
    mode,
    sources,
    totalOut,
    stats: {
      ...plan.stats,
      routable: sources.filter((s) => s.status === "ROUTABLE" || s.status === "PARTIAL").length,
      noRoute: sources.filter((s) => s.status === "NO_ROUTE").length,
    },
  };
}
