import { encodeFunctionData, parseAbi, type Hex, type PublicClient } from "viem";
import {
  nodeFromAsset,
  scaleDecimals,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ConsolidationPlan,
  type ExecutionStep,
  type RouteCandidate,
  type RouteEdge,
  type RouteProvider,
  type SourcePlan,
  type TypedDataPayload,
} from "@testnet-router/core";
import { CCTP_DOMAINS, CIRCLE_GATEWAY_TESTNET, SOURCES, findChain, usdcAsset } from "@testnet-router/registry";
import { HttpError, TtlCache, approvalStepIfNeeded, assetById, edgeId, fetchJson, stepId, toBytes32Address } from "../shared";

const walletAbi = parseAbi([
  "function deposit(address token, uint256 value)",
  "function domain() view returns (uint32)",
  "function availableBalance(address token, address depositor) view returns (uint256)",
]);

const QUOTE_TTL_MS = 3 * 60_000;
const MAX_UINT256 = (1n << 256n) - 1n;
const SLOW_FINALITY_SECONDS = 18 * 60;
const FAST_FINALITY_SECONDS = 60;
const FORWARDING_SECONDS = 90;

/** Bytecode presence of the Gateway wallet per chain, checked once per session window. */
const deployedCache = new TtlCache<boolean>(30 * 60_000);

/** One source of a multi-chain burn intent set (amounts in 6-decimal USDC units). */
export interface GatewaySetSource {
  chainId: number;
  domain: number;
  token: Address;
  planned: string;
}

/** Circle accepts at most 16 burn intents per transfer request. */
export const GATEWAY_SET_MAX_INTENTS = 16;

export interface GatewayMeta {
  /**
   * undefined: deposit → finality → intent → forwarded mint for one source.
   * "deposit": only the approve + deposit of a pooled transfer.
   * "collect": one signature over a BurnIntentSet spending every deposited source, one forwarded mint.
   */
  role?: "deposit" | "collect";
  set?: GatewaySetSource[];
  fromChainId: number;
  toChainId: number;
  sourceDomain: number;
  destinationDomain: number;
  /** ERC-20 interface of USDC on the source (Arc: the native mirror). */
  sourceToken: Address;
  sourceTokenDecimals: number;
  destinationToken: Address;
}

interface TransferSpecJson {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: Hex;
  destinationContract: Hex;
  sourceToken: Hex;
  destinationToken: Hex;
  sourceDepositor: Hex;
  destinationRecipient: Hex;
  sourceSigner: Hex;
  destinationCaller: Hex;
  value: string;
  salt: Hex;
  hookData: Hex;
}

interface BurnIntentJson {
  maxBlockHeight: string;
  maxFee: string;
  spec: TransferSpecJson;
}

type EstimateItem = { burnIntent?: BurnIntentJson; burnIntentSet?: { intents: BurnIntentJson[] } };

interface EstimateResponse {
  body?: EstimateItem[];
  fees?: { token?: string; total?: string; forwardingFee?: string; perIntent?: { baseFee?: string; transferFee?: string }[] };
}

interface TransferResponse {
  transferId: string;
  attestation?: Hex;
  signature?: Hex;
  expirationBlock?: string;
}

interface TransferStatusResponse {
  status?: "pending" | "confirmed" | "finalized" | "failed" | "expired";
  transactionHash?: Hex;
  forwardingDetails?: { forwardingEnabled?: boolean; failureReason?: string };
}

interface BalancesResponse {
  balances?: { domain: number; depositor: string; balance: string }[];
}

function burnTokenFor(asset: Asset): { address: Address; decimals: number } | undefined {
  if (asset.address) return { address: asset.address, decimals: asset.decimals };
  const mirror = findChain(asset.chainId)?.nativeAsset.erc20Mirror;
  return mirror ? { address: mirror.address, decimals: mirror.decimals } : undefined;
}

function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function spec(meta: Pick<GatewayMeta, "sourceDomain" | "destinationDomain" | "sourceToken" | "destinationToken">, depositor: Address, recipient: Address, value: bigint, salt: Hex): TransferSpecJson {
  return {
    version: 1,
    sourceDomain: meta.sourceDomain,
    destinationDomain: meta.destinationDomain,
    sourceContract: toBytes32Address(CIRCLE_GATEWAY_TESTNET.wallet),
    destinationContract: toBytes32Address(CIRCLE_GATEWAY_TESTNET.minter),
    sourceToken: toBytes32Address(meta.sourceToken),
    destinationToken: toBytes32Address(meta.destinationToken),
    sourceDepositor: toBytes32Address(depositor),
    destinationRecipient: toBytes32Address(recipient),
    sourceSigner: toBytes32Address(depositor),
    destinationCaller: toBytes32Address("0x0000000000000000000000000000000000000000"),
    value: value.toString(),
    salt,
    hookData: "0x",
  };
}

/** USDC decimal string from the API ("0.127000") → minor units. */
function parseUsdc(s: string): bigint {
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
}

async function isDeployed(client: PublicClient, chainId: number): Promise<boolean> {
  return deployedCache.get(`gateway:${chainId}`, async () => {
    try {
      const code = await client.getCode({ address: CIRCLE_GATEWAY_TESTNET.wallet });
      if (!code || code === "0x") return false;
      const domain = await client.readContract({ address: CIRCLE_GATEWAY_TESTNET.wallet, abi: walletAbi, functionName: "domain" });
      return CCTP_DOMAINS.some((d) => d.chainId === chainId && d.domain === domain);
    } catch {
      return false;
    }
  });
}

const JSON_POST = { method: "POST", headers: { "content-type": "application/json" } } as const;

/** EIP-712 types as hashed by GatewayWallet (BurnIntents.sol: BURN_INTENT_TYPEHASH / BURN_INTENT_SET_TYPEHASH). */
export const GATEWAY_EIP712_TYPES = {
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
  BurnIntentSet: [{ name: "intents", type: "BurnIntent[]" }],
};

const EIP712_DOMAIN = { name: CIRCLE_GATEWAY_TESTNET.eip712.name, version: CIRCLE_GATEWAY_TESTNET.eip712.version };

function intentMessage(intent: BurnIntentJson): Record<string, unknown> {
  return { maxBlockHeight: BigInt(intent.maxBlockHeight), maxFee: BigInt(intent.maxFee), spec: { ...intent.spec, value: BigInt(intent.spec.value) } };
}

function intentTypedData(intent: BurnIntentJson): TypedDataPayload {
  const { BurnIntentSet: _set, ...types } = GATEWAY_EIP712_TYPES;
  return { domain: EIP712_DOMAIN, types, primaryType: "BurnIntent", message: intentMessage(intent) };
}

function setTypedData(intents: BurnIntentJson[]): TypedDataPayload {
  return { domain: EIP712_DOMAIN, types: GATEWAY_EIP712_TYPES, primaryType: "BurnIntentSet", message: { intents: intents.map(intentMessage) } };
}

/** Max fee per transfer spec from /v1/estimate (forwarder on), keyed by salt. `asSet` charges one forwarding fee for all of them. */
async function estimateFees(fetchImpl: typeof fetch, specs: TransferSpecJson[], asSet: boolean): Promise<{ maxFee: Map<string, bigint>; forwardingFee?: string } | null> {
  let estimate: EstimateResponse | EstimateItem[];
  try {
    estimate = await fetchJson<EstimateResponse | EstimateItem[]>(
      fetchImpl,
      `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/estimate?enableForwarder=true`,
      { ...JSON_POST, body: JSON.stringify(asSet ? [{ intents: specs.map((s) => ({ spec: s })) }] : specs.map((s) => ({ spec: s }))) },
      20_000,
      1,
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) return null;
    throw err;
  }
  const items = Array.isArray(estimate) ? estimate : (estimate.body ?? []);
  const intents = items.flatMap((i) => (i.burnIntentSet ? i.burnIntentSet.intents : i.burnIntent ? [i.burnIntent] : []));
  if (intents.length !== specs.length) return null;
  const maxFee = new Map(intents.map((i) => [i.spec.salt.toLowerCase(), BigInt(i.maxFee)]));
  return { maxFee, forwardingFee: Array.isArray(estimate) ? undefined : estimate.fees?.forwardingFee };
}

/** Finalized (spendable) Gateway balance per source domain, 6-decimal units. */
async function apiBalances(fetchImpl: typeof fetch, depositor: Address, domains: number[]): Promise<Map<number, bigint>> {
  const res = await fetchJson<BalancesResponse>(
    fetchImpl,
    `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/balances`,
    { ...JSON_POST, body: JSON.stringify({ token: "USDC", sources: domains.map((domain) => ({ domain, depositor })) }) },
    15_000,
    1,
  );
  return new Map((res.balances ?? []).map((b) => [b.domain, parseUsdc(b.balance)]));
}

export interface GatewaySetSizing {
  /** Signed as-is: value = amount − maxFee per source, the forwarding fee sits on the largest one. */
  intents: BurnIntentJson[];
  totalIn: bigint;
  totalOut: bigint;
  totalFee: bigint;
  forwardingFee?: string;
  /** Sources whose amount does not even cover their own base fee. */
  dropped: number[];
}

/**
 * Sizes a burn intent set: largest source first (it carries the one-off
 * forwarding fee), sources that cannot pay their own fee are dropped and the
 * rest re-estimated.
 */
export async function sizeGatewaySet(input: {
  fetch: typeof fetch;
  wallet: Address;
  recipient: Address;
  destinationDomain: number;
  destinationToken: Address;
  sources: { chainId: number; domain: number; token: Address; amount: bigint }[];
}): Promise<GatewaySetSizing | null> {
  let sources = input.sources.filter((s) => s.amount > 0n).sort((a, b) => (a.amount === b.amount ? a.domain - b.domain : a.amount > b.amount ? -1 : 1));
  const dropped = sources.slice(GATEWAY_SET_MAX_INTENTS).map((s) => s.chainId);
  sources = sources.slice(0, GATEWAY_SET_MAX_INTENTS);
  for (let attempt = 0; attempt < 4 && sources.length > 0; attempt += 1) {
    const specs = sources.map((s) => spec({ sourceDomain: s.domain, destinationDomain: input.destinationDomain, sourceToken: s.token, destinationToken: input.destinationToken }, input.wallet, input.recipient, s.amount, randomSalt()));
    const fees = await estimateFees(input.fetch, specs, true);
    if (!fees) return null;
    const feeOf = (i: number) => fees.maxFee.get(specs[i]!.salt.toLowerCase()) ?? 0n;
    const short = sources.filter((s, i) => s.amount <= feeOf(i));
    if (short.length > 0) {
      // The head of the list pays the forwarding fee; when even the largest source cannot, nothing can.
      if (short.includes(sources[0]!)) return null;
      dropped.push(...short.map((s) => s.chainId));
      sources = sources.filter((s) => !short.includes(s));
      continue;
    }
    const intents = specs.map((s, i) => ({ maxBlockHeight: MAX_UINT256.toString(), maxFee: feeOf(i).toString(), spec: { ...s, value: (sources[i]!.amount - feeOf(i)).toString() } }));
    const totalIn = sources.reduce((acc, s) => acc + s.amount, 0n);
    const totalFee = intents.reduce((acc, i) => acc + BigInt(i.maxFee), 0n);
    return { intents, totalIn, totalOut: totalIn - totalFee, totalFee, forwardingFee: fees.forwardingFee, dropped };
  }
  return null;
}

function setSummary(sizing: GatewaySetSizing, recipient: Address, destinationDomain: number): string {
  return `BurnIntentSet: ${sizing.intents.length} sources (domains ${sizing.intents.map((i) => i.spec.sourceDomain).join(", ")}) → ${sizing.totalOut} USDC units to ${recipient} on domain ${destinationDomain} in one mint, total maxFee ${sizing.totalFee}, no expiry`;
}

function gatewayEdge(fromAsset: Asset, toAsset: Asset, meta: GatewayMeta, variant?: string): CapabilityEdge {
  const from = nodeFromAsset(fromAsset);
  const to = nodeFromAsset(toAsset);
  const fast = CIRCLE_GATEWAY_TESTNET.fastFinalityChainIds.includes(meta.fromChainId);
  return {
    id: edgeId("circle-gateway", "CIRCLE_GATEWAY", from, to, variant),
    provider: "circle-gateway",
    type: "CIRCLE_GATEWAY",
    from,
    to,
    crossChain: true,
    requiresApproval: meta.role !== "collect",
    requiresSourceGas: meta.role !== "collect",
    requiresDestinationGas: false,
    outputCanonicality: toAsset.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
    reliabilityClass: "ISSUER",
    baselineGasUnits: meta.role === "collect" ? 0n : 160_000n,
    baselineSeconds: (fast ? FAST_FINALITY_SECONDS : SLOW_FINALITY_SECONDS) + FORWARDING_SECONDS,
    source: SOURCES.circleGateway,
    trustMetadata: { issuerApproved: true, sourceRegistry: "Circle Gateway (unified USDC balance)" },
    meta: meta as unknown as Record<string, unknown>,
  };
}

function metaFor(fromAsset: Asset, toAsset: Asset): GatewayMeta | undefined {
  const burn = burnTokenFor(fromAsset);
  const dstToken = burnTokenFor(toAsset);
  const srcDomain = CCTP_DOMAINS.find((d) => d.chainId === fromAsset.chainId)?.domain;
  const dstDomain = CCTP_DOMAINS.find((d) => d.chainId === toAsset.chainId)?.domain;
  if (!burn || !dstToken || srcDomain === undefined || dstDomain === undefined) return undefined;
  return {
    fromChainId: fromAsset.chainId,
    toChainId: toAsset.chainId,
    sourceDomain: srcDomain,
    destinationDomain: dstDomain,
    sourceToken: burn.address,
    sourceTokenDecimals: burn.decimals,
    destinationToken: dstToken.address,
  };
}

export interface GatewaySetPlan {
  id: string;
  /** approve + deposit per source chain; nothing is waited for between them. */
  legs: RouteCandidate[];
  /** Waits for every deposit's finality, then one signature and one forwarded mint. */
  collector: RouteCandidate;
  totalIn: bigint;
  /** Destination asset units. */
  totalOut: bigint;
  totalFee: bigint;
  forwardingFee?: string;
  droppedChainIds: number[];
}

/**
 * Pooled Gateway transfer for USDC sitting on several chains: every source
 * deposits into its GatewayWallet, then ONE BurnIntentSet signature spends all
 * of them and Circle's forwarder mints once. The forwarding fee is charged per
 * transfer request, so dust that could not pay it alone still gets through.
 */
export async function planGatewaySet(input: {
  sources: { asset: Asset; amount: bigint }[];
  destination: Asset;
  wallet: Address;
  recipient: Address;
  fetch: typeof fetch;
  now: number;
}): Promise<GatewaySetPlan | null> {
  const usable = input.sources
    .map((s) => ({ ...s, meta: metaFor(s.asset, input.destination) }))
    .filter((s): s is typeof s & { meta: GatewayMeta } =>
      Boolean(s.meta) && CIRCLE_GATEWAY_TESTNET.chainIds.includes(s.asset.chainId) && s.asset.chainId !== input.destination.chainId && usdcAsset(s.asset.chainId)?.id === s.asset.id,
    );
  const dstMeta = usable[0]?.meta;
  if (usable.length < 2 || !dstMeta || !CIRCLE_GATEWAY_TESTNET.chainIds.includes(input.destination.chainId)) return null;

  const units = (s: (typeof usable)[number]) => scaleDecimals(s.amount, s.asset.decimals, s.meta.sourceTokenDecimals);
  const sizing = await sizeGatewaySet({
    fetch: input.fetch,
    wallet: input.wallet,
    recipient: input.recipient,
    destinationDomain: dstMeta.destinationDomain,
    destinationToken: dstMeta.destinationToken,
    sources: usable.map((s) => ({ chainId: s.asset.chainId, domain: s.meta.sourceDomain, token: s.meta.sourceToken, amount: units(s) })),
  });
  if (!sizing || sizing.intents.length < 2) return null;

  const included = sizing.intents.map((i) => usable.find((s) => s.meta.sourceDomain === i.spec.sourceDomain)!);
  const toDest = (v: bigint) => scaleDecimals(v, 6, input.destination.decimals);
  const expiresAt = input.now + QUOTE_TTL_MS;
  const base = { destination: nodeFromAsset(input.destination), swapCount: 0, bridgeCount: 1, outputCanonicality: input.destination.kind === "NATIVE" ? "NATIVE" : "CANONICAL", reliabilityClass: "ISSUER", requiresDestinationGas: false, health: "QUOTED" } as const;

  const legs: RouteCandidate[] = included.map((s) => {
    const meta: GatewayMeta = { ...s.meta, role: "deposit" };
    const out = toDest(units(s));
    const edge: RouteEdge = {
      ...gatewayEdge(s.asset, input.destination, meta, "set-deposit"),
      health: "QUOTED",
      healthNote: "Gateway deposit · spent by the pooled burn intent set",
      quote: { provider: "circle-gateway", amountIn: s.amount, amountOut: out, minAmountOut: out, feeOut: 0n, estimatedGasUnits: 160_000n, estimatedSeconds: 30, txCount: 2, quotedAt: input.now, expiresAt },
    };
    return { ...base, id: `gwset:${s.asset.id}:${input.now}`, sourceChainId: s.asset.chainId, sourceAsset: s.asset, amountIn: s.amount, edges: [edge], amountOut: out, minAmountOut: out, txCount: 2, estimatedSeconds: 30, sourceGasUnits: 160_000n, requiresSourceGas: true };
  });

  const head = included[0]!;
  const set: GatewaySetSource[] = included.map((s) => ({ chainId: s.asset.chainId, domain: s.meta.sourceDomain, token: s.meta.sourceToken, planned: units(s).toString() }));
  const collectMeta: GatewayMeta = { ...head.meta, role: "collect", set };
  const slow = included.some((s) => !CIRCLE_GATEWAY_TESTNET.fastFinalityChainIds.includes(s.asset.chainId));
  const seconds = (slow ? SLOW_FINALITY_SECONDS : FAST_FINALITY_SECONDS) + FORWARDING_SECONDS;
  const totalInHead = scaleDecimals(sizing.totalIn, 6, head.asset.decimals);
  const collectEdge: RouteEdge = {
    ...gatewayEdge(head.asset, input.destination, collectMeta, "set-collect"),
    baselineSeconds: seconds,
    health: "QUOTED",
    healthNote: `one signature for ${included.length} chains · one forwarded mint · fee ${(Number(sizing.totalFee) / 1e6).toFixed(4)} USDC`,
    quote: {
      provider: "circle-gateway",
      amountIn: totalInHead,
      amountOut: toDest(sizing.totalOut),
      minAmountOut: toDest(sizing.totalOut),
      feeOut: toDest(sizing.totalFee),
      estimatedGasUnits: 0n,
      estimatedSeconds: seconds,
      txCount: 1,
      quotedAt: input.now,
      expiresAt,
    },
  };
  const collector: RouteCandidate = { ...base, id: `gwset:collect:${input.now}`, sourceChainId: head.asset.chainId, sourceAsset: head.asset, amountIn: totalInHead, edges: [collectEdge], amountOut: toDest(sizing.totalOut), minAmountOut: toDest(sizing.totalOut), txCount: 1, estimatedSeconds: seconds, sourceGasUnits: 0n, requiresSourceGas: false };

  return { id: `gwset:${input.now}`, legs, collector, totalIn: sizing.totalIn, totalOut: toDest(sizing.totalOut), totalFee: sizing.totalFee, forwardingFee: sizing.forwardingFee, droppedChainIds: sizing.dropped };
}

export interface GatewaySetOffer {
  set: GatewaySetPlan;
  /** The plan's sources taking part, in set order. */
  sources: SourcePlan[];
  /** What the same balances yield through their own selected routes. */
  separateOut: bigint;
  separateTxCount: number;
  /** Balances that have no route on their own but travel with the set. */
  rescued: number;
}

function setEligible(s: SourcePlan, destinationChainId: number): boolean {
  if (s.sourceChainId === destinationChainId || s.routable <= 0n || s.gas.shortfall > 0n) return false;
  if (!CIRCLE_GATEWAY_TESTNET.chainIds.includes(s.sourceChainId) || usdcAsset(s.sourceChainId)?.id !== s.asset.id) return false;
  if (s.status === "ROUTABLE" || s.status === "PARTIAL") return true;
  return s.status === "NO_ROUTE" && s.reason !== "BELOW_DUST_THRESHOLD";
}

/** Sources of a plan that can join a Gateway set (Circle USDC on a Gateway chain, gas covered, target is Gateway USDC). */
export function gatewaySetCandidates(plan: ConsolidationPlan, destination: Asset | undefined): SourcePlan[] {
  if (!destination || !CIRCLE_GATEWAY_TESTNET.chainIds.includes(destination.chainId) || usdcAsset(destination.chainId)?.id !== destination.id) return [];
  return plan.sources.filter((s) => setEligible(s, destination.chainId));
}

/**
 * The pooled Gateway alternative for a plan. Offered when it delivers within
 * 2 % of the separate routes (it needs one signature, no destination gas and
 * no claim transactions) or carries balances that have no route of their own.
 */
export async function offerGatewaySet(input: { plan: ConsolidationPlan; destination: Asset; wallet: Address; recipient: Address; fetch: typeof fetch; now: number }): Promise<GatewaySetOffer | null> {
  const candidates = gatewaySetCandidates(input.plan, input.destination);
  if (candidates.length < 2) return null;
  const set = await planGatewaySet({ sources: candidates.map((s) => ({ asset: s.asset, amount: s.routable })), destination: input.destination, wallet: input.wallet, recipient: input.recipient, fetch: input.fetch, now: input.now });
  if (!set) return null;
  const sources = set.legs.map((l) => candidates.find((s) => s.asset.id === l.sourceAsset.id)).filter((s): s is SourcePlan => Boolean(s));
  const separateOut = sources.reduce((acc, s) => acc + (s.selected?.amountOut ?? 0n), 0n);
  const rescued = sources.filter((s) => !s.selected).length;
  if (rescued === 0 && set.totalOut * 100n < separateOut * 98n) return null;
  return { set, sources, separateOut, separateTxCount: sources.reduce((acc, s) => acc + (s.selected?.txCount ?? 0), 0), rescued };
}

/**
 * Circle Gateway: deposit USDC into the Gateway wallet on the source chain,
 * wait for finality, sign an EIP-712 burn intent, and let Circle's forwarder
 * mint on the destination (no destination gas). Fees come from /v1/estimate
 * and are taken from the deposited amount, so the recipient gets
 * amountIn − maxFee. The intent is re-estimated when finality is reached, so
 * the signed maxFee is seconds old when it is posted.
 */
export const circleGatewayProvider: RouteProvider = {
  key: "circle-gateway",
  name: "Circle Gateway",
  source: SOURCES.circleGateway,

  async discover(ctx) {
    const edges: CapabilityEdge[] = [];
    const chains = ctx.chains.filter((c) => CIRCLE_GATEWAY_TESTNET.chainIds.includes(c.id));
    for (const src of chains) {
      if (ctx.sourceChainIds && !ctx.sourceChainIds.includes(src.id)) continue;
      const fromAsset = usdcAsset(src.id);
      if (!fromAsset || !burnTokenFor(fromAsset)) continue;
      if (!(await isDeployed(ctx.clients.get(src.id), src.id))) continue;
      for (const dst of chains) {
        if (dst.id === src.id) continue;
        const toAsset = usdcAsset(dst.id);
        const meta = toAsset ? metaFor(fromAsset, toAsset) : undefined;
        if (!toAsset || !meta) continue;
        edges.push(gatewayEdge(fromAsset, toAsset, meta));
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as GatewayMeta;
    const fromAsset = assetById(req.assets, req.edge.from.assetId);
    const toAsset = assetById(req.assets, req.edge.to.assetId);
    const toDest = (v: bigint) => scaleDecimals(v, 6, toAsset.decimals);
    const common = { provider: "circle-gateway", amountIn: req.amountIn, quotedAt: req.now, expiresAt: req.now + QUOTE_TTL_MS };

    if (meta.role === "deposit") {
      const usdcIn = scaleDecimals(req.amountIn, fromAsset.decimals, meta.sourceTokenDecimals);
      if (usdcIn <= 0n) return null;
      return { ...req.edge, health: "QUOTED", quote: { ...common, amountOut: toDest(usdcIn), minAmountOut: toDest(usdcIn), feeOut: 0n, estimatedGasUnits: 160_000n, estimatedSeconds: 30, txCount: 2 } } satisfies RouteEdge;
    }

    if (meta.role === "collect") {
      const sizing = await sizeGatewaySet({
        fetch: req.fetch,
        wallet: req.wallet,
        recipient: req.recipient,
        destinationDomain: meta.destinationDomain,
        destinationToken: meta.destinationToken,
        sources: (meta.set ?? []).map((s) => ({ ...s, amount: BigInt(s.planned) })),
      });
      if (!sizing) return null;
      return {
        ...req.edge,
        health: "QUOTED",
        healthNote: `one signature for ${sizing.intents.length} chains · one forwarded mint · fee ${(Number(sizing.totalFee) / 1e6).toFixed(4)} USDC`,
        quote: { ...common, amountOut: toDest(sizing.totalOut), minAmountOut: toDest(sizing.totalOut), feeOut: toDest(sizing.totalFee), estimatedGasUnits: 0n, estimatedSeconds: req.edge.baselineSeconds, txCount: 1 },
      } satisfies RouteEdge;
    }

    const usdcIn = scaleDecimals(req.amountIn, fromAsset.decimals, meta.sourceTokenDecimals);
    if (usdcIn <= 0n) return null;
    const probe = spec(meta, req.wallet, req.recipient, usdcIn, randomSalt());
    const fees = await estimateFees(req.fetch, [probe], false);
    const maxFee = fees?.maxFee.get(probe.salt.toLowerCase());
    if (!fees || maxFee === undefined || maxFee >= usdcIn) return null;
    const usdcOut = usdcIn - maxFee;
    const fast = CIRCLE_GATEWAY_TESTNET.fastFinalityChainIds.includes(meta.fromChainId);
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `Gateway deposit → forwarded mint · fee ${(Number(maxFee) / 1e6).toFixed(4)} USDC${fees.forwardingFee ? ` (incl. forwarding ${fees.forwardingFee})` : ""} · finality ${fast ? "seconds" : "~15 min"}`,
      quote: {
        ...common,
        amountOut: scaleDecimals(usdcOut, meta.sourceTokenDecimals, toAsset.decimals),
        minAmountOut: scaleDecimals(usdcOut, meta.sourceTokenDecimals, toAsset.decimals),
        feeOut: scaleDecimals(maxFee, meta.sourceTokenDecimals, toAsset.decimals),
        estimatedGasUnits: 160_000n,
        estimatedSeconds: req.edge.baselineSeconds,
        txCount: 2,
        raw: { usdcIn: usdcIn.toString(), maxFee: maxFee.toString() },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as GatewayMeta;
    const step = { provider: "circle-gateway", edgeId: edge.id, status: "PENDING" } as const;

    if (meta.role === "collect") {
      // Deposits are on-chain state the moment they confirm; the API balance follows at finality.
      const amounts: { chainId: number; domain: number; token: Address; amount: bigint }[] = [];
      for (const s of meta.set ?? []) {
        let onChain = 0n;
        try {
          onChain = await ctx.clients.get(s.chainId).readContract({ address: CIRCLE_GATEWAY_TESTNET.wallet, abi: walletAbi, functionName: "availableBalance", args: [s.token, ctx.wallet] });
        } catch {
          onChain = 0n;
        }
        const planned = BigInt(s.planned);
        const amount = onChain < planned ? onChain : planned;
        if (amount > 0n) amounts.push({ chainId: s.chainId, domain: s.domain, token: s.token, amount });
      }
      if (amounts.length === 0) throw new Error("No Gateway deposit found for this pooled transfer: run the deposit routes first");
      const sizing = await sizeGatewaySet({ fetch: ctx.fetch, wallet: ctx.wallet, recipient: ctx.recipient, destinationDomain: meta.destinationDomain, destinationToken: meta.destinationToken, sources: amounts });
      if (!sizing) throw new Error("Gateway fees exceed the deposited amounts");
      const kept = amounts.filter((a) => sizing.intents.some((i) => i.spec.sourceDomain === a.domain));
      return [
        {
          ...step,
          id: stepId(edge.id, "finality"),
          type: "WAIT_ATTESTATION",
          chainId: meta.fromChainId,
          label: `Deposit finality on ${kept.length} chains (Gateway balance)`,
          pollIntervalMs: 20_000,
          poll: { stage: "set-finality", sources: kept.map((a) => ({ ...a, amount: a.amount.toString() })) },
        },
        {
          ...step,
          id: stepId(edge.id, "intent"),
          type: "PERMIT",
          chainId: meta.fromChainId,
          label: `Sign one burn intent set for ${sizing.intents.length} chains (EIP-712)`,
          summary: setSummary(sizing, ctx.recipient, meta.destinationDomain),
          typedData: setTypedData(sizing.intents),
        },
        {
          ...step,
          id: stepId(edge.id, "transfer"),
          type: "WAIT_ATTESTATION",
          chainId: meta.toChainId,
          label: "Gateway attestation and forwarded mint",
          pollIntervalMs: 10_000,
          poll: { stage: "transfer", burnIntentSet: { intents: sizing.intents }, expectedOut: sizing.totalOut.toString() },
        },
      ];
    }

    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const client = ctx.clients.get(meta.fromChainId);
    const usdcIn = scaleDecimals(ctx.amountIn, fromAsset.decimals, meta.sourceTokenDecimals);
    if (usdcIn <= 0n) throw new Error("Nothing to deposit");
    const steps: ExecutionStep[] = [];

    const approve = await approvalStepIfNeeded({
      client,
      chainId: meta.fromChainId,
      token: meta.sourceToken,
      owner: ctx.wallet,
      spender: CIRCLE_GATEWAY_TESTNET.wallet,
      amount: usdcIn,
      provider: "circle-gateway",
      edgeId: edge.id,
      symbol: "USDC",
    });
    if (approve) steps.push(approve);
    steps.push({
      ...step,
      id: stepId(edge.id, "deposit"),
      type: "BRIDGE",
      chainId: meta.fromChainId,
      label: `Gateway deposit on ${findChain(meta.fromChainId)?.shortName ?? meta.fromChainId}`,
      simulate: true,
      expiresAt: edge.quote.expiresAt,
      summary: `GatewayWallet.deposit(USDC ${meta.sourceToken}, ${usdcIn} units) · never a plain transfer to the contract`,
      tx: {
        chainId: meta.fromChainId,
        to: CIRCLE_GATEWAY_TESTNET.wallet,
        value: 0n,
        data: encodeFunctionData({ abi: walletAbi, functionName: "deposit", args: [meta.sourceToken, usdcIn] }),
      },
    });
    if (meta.role === "deposit") return steps;

    const raw = edge.quote.raw as { maxFee: string };
    const maxFee = BigInt(raw.maxFee);
    if (usdcIn <= maxFee) throw new Error("Gateway fee exceeds the amount");

    // Available balance before the deposit, so finality is detected as an increase.
    let availableBefore = 0n;
    try {
      availableBefore = (await apiBalances(ctx.fetch, ctx.wallet, [meta.sourceDomain])).get(meta.sourceDomain) ?? 0n;
    } catch {
      availableBefore = 0n;
    }
    steps.push({
      ...step,
      id: stepId(edge.id, "finality"),
      type: "WAIT_ATTESTATION",
      chainId: meta.fromChainId,
      label: "Deposit finality (Gateway balance)",
      pollIntervalMs: 20_000,
      poll: { stage: "finality", sourceDomain: meta.sourceDomain, needed: (availableBefore + usdcIn).toString(), usdcIn: usdcIn.toString() },
    });

    const intent: BurnIntentJson = { maxBlockHeight: MAX_UINT256.toString(), maxFee: maxFee.toString(), spec: spec(meta, ctx.wallet, ctx.recipient, usdcIn - maxFee, randomSalt()) };
    steps.push({
      ...step,
      id: stepId(edge.id, "intent"),
      type: "PERMIT",
      chainId: meta.fromChainId,
      label: "Sign Gateway burn intent (EIP-712)",
      summary: `BurnIntent: ${usdcIn - maxFee} USDC units from domain ${meta.sourceDomain} to ${ctx.recipient} on domain ${meta.destinationDomain}, maxFee ${maxFee}, no expiry`,
      typedData: intentTypedData(intent),
    });
    steps.push({
      ...step,
      id: stepId(edge.id, "transfer"),
      type: "WAIT_ATTESTATION",
      chainId: meta.toChainId,
      label: "Gateway attestation and forwarded mint",
      pollIntervalMs: 10_000,
      poll: { stage: "transfer", burnIntent: intent, expectedOut: (usdcIn - maxFee).toString() },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as GatewayMeta;
    const poll = (exec.poll ?? {}) as {
      stage?: string;
      needed?: string;
      usdcIn?: string;
      sources?: { chainId: number; domain: number; token: Address; amount: string }[];
      burnIntent?: BurnIntentJson;
      burnIntentSet?: { intents: BurnIntentJson[] };
      permitSignature?: Hex;
      transferId?: string;
      expectedOut?: string;
    };
    const toAsset = exec.edge.to;
    const outDecimals = findChain(toAsset.chainId)?.nativeAsset.erc20Mirror && toAsset.representation === "NATIVE" ? 18 : 6;
    const recipient = exec.recipient ?? exec.wallet;
    const usd = (v: bigint) => (Number(v) / 1e6).toFixed(6);

    if (poll.stage === "finality") {
      const available = (await apiBalances(exec.fetch, exec.wallet, [meta.sourceDomain])).get(meta.sourceDomain) ?? 0n;
      const needed = BigInt(poll.needed ?? "0");
      if (available < needed) return { kind: "PENDING", detail: `Waiting for deposit finality (${usd(available)} of ${usd(needed)} USDC available)` };
      // Fees move with destination gas: what the wallet signs next is estimated now, not before the wait.
      const usdcIn = BigInt(poll.usdcIn ?? "0");
      if (usdcIn > 0n) {
        const probe = spec(meta, exec.wallet, recipient, usdcIn, randomSalt());
        const fees = await estimateFees(exec.fetch, [probe], false);
        const maxFee = fees?.maxFee.get(probe.salt.toLowerCase());
        if (maxFee !== undefined && maxFee < usdcIn) {
          const intent: BurnIntentJson = { maxBlockHeight: MAX_UINT256.toString(), maxFee: maxFee.toString(), spec: { ...probe, value: (usdcIn - maxFee).toString() } };
          return {
            kind: "COMPLETED",
            detail: `Deposit finalized: ${usd(available)} USDC available in Gateway`,
            amountOut: scaleDecimals(usdcIn - maxFee, 6, outDecimals),
            nextPermit: {
              typedData: intentTypedData(intent),
              summary: `BurnIntent: ${usdcIn - maxFee} USDC units from domain ${meta.sourceDomain} to ${recipient} on domain ${meta.destinationDomain}, maxFee ${maxFee}, no expiry`,
              poll: { burnIntent: intent, expectedOut: (usdcIn - maxFee).toString() },
            },
          };
        }
      }
      return { kind: "COMPLETED", detail: `Deposit finalized: ${usd(available)} USDC available in Gateway` };
    }

    if (poll.stage === "set-finality") {
      const sources = (poll.sources ?? []).map((s) => ({ ...s, amount: BigInt(s.amount) }));
      const balances = await apiBalances(exec.fetch, exec.wallet, sources.map((s) => s.domain));
      const waiting = sources.filter((s) => (balances.get(s.domain) ?? 0n) < s.amount);
      if (waiting.length > 0) {
        return { kind: "PENDING", detail: `Waiting for deposit finality on ${waiting.map((s) => findChain(s.chainId)?.shortName ?? s.chainId).join(", ")} (${sources.length - waiting.length}/${sources.length} ready)` };
      }
      const sizing = await sizeGatewaySet({ fetch: exec.fetch, wallet: exec.wallet, recipient, destinationDomain: meta.destinationDomain, destinationToken: meta.destinationToken, sources });
      if (!sizing) return { kind: "FAILED", detail: "Gateway fees exceed the deposited amounts; the deposits stay in your Gateway balance" };
      return {
        kind: "COMPLETED",
        detail: `All ${sources.length} deposits finalized`,
        amountOut: scaleDecimals(sizing.totalOut, 6, outDecimals),
        nextPermit: { typedData: setTypedData(sizing.intents), summary: setSummary(sizing, recipient, meta.destinationDomain), poll: { burnIntentSet: { intents: sizing.intents }, expectedOut: sizing.totalOut.toString() } },
      };
    }

    if (poll.stage === "transfer") {
      const signed = poll.burnIntentSet ? { burnIntentSet: poll.burnIntentSet } : poll.burnIntent ? { burnIntent: poll.burnIntent } : undefined;
      if (!signed) return { kind: "FAILED", detail: "Burn intent missing from the step" };
      if (!poll.permitSignature) return { kind: "PENDING", detail: "Waiting for the burn intent signature" };
      let transferId = poll.transferId;
      if (!transferId) {
        let res: TransferResponse;
        try {
          res = await fetchJson<TransferResponse>(
            exec.fetch,
            `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/transfer?enableForwarder=true`,
            { ...JSON_POST, body: JSON.stringify([{ ...signed, signature: poll.permitSignature }]) },
            30_000,
            0,
          );
        } catch (err) {
          // A rejected intent never becomes valid by polling; nothing was burned, the deposit stays in the Gateway balance.
          if (err instanceof HttpError && err.status >= 400 && err.status < 500) return { kind: "FAILED", detail: `Gateway rejected the burn intent: ${err.body.slice(0, 200)}` };
          throw err;
        }
        transferId = res.transferId;
        return { kind: "PENDING", detail: `Transfer ${transferId} accepted by Circle; forwarding the mint`, persist: { transferId, attestation: res.attestation } };
      }
      const st = await fetchJson<TransferStatusResponse>(exec.fetch, `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/transfer/${transferId}`, undefined, 15_000, 1);
      if (st.status === "confirmed" || st.status === "finalized") {
        return { kind: "MINTED", detail: `Minted by Circle's forwarder (${st.status})`, destinationTxHash: st.transactionHash, amountOut: scaleDecimals(BigInt(poll.expectedOut ?? "0"), 6, outDecimals) };
      }
      if (st.status === "failed" || st.status === "expired") {
        return { kind: "FAILED", detail: `Gateway transfer ${st.status}${st.forwardingDetails?.failureReason ? `: ${st.forwardingDetails.failureReason}` : ""}` };
      }
      return { kind: "PENDING", detail: `Gateway transfer ${st.status ?? "pending"}` };
    }
    return { kind: "PENDING", detail: "Unknown Gateway stage" };
  },
};
