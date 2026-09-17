import { encodeFunctionData, parseAbi, type Hex, type PublicClient } from "viem";
import {
  nodeFromAsset,
  scaleDecimals,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
  type TypedDataPayload,
} from "@testnet-router/core";
import { CCTP_DOMAINS, CIRCLE_GATEWAY_TESTNET, SOURCES, findChain, usdcAsset } from "@testnet-router/registry";
import { HttpError, TtlCache, approvalStepIfNeeded, assetById, edgeId, fetchJson, stepId, toBytes32Address } from "../shared";

const walletAbi = parseAbi(["function deposit(address token, uint256 value)", "function domain() view returns (uint32)"]);

const QUOTE_TTL_MS = 3 * 60_000;
const MAX_UINT256 = (1n << 256n) - 1n;
const SLOW_FINALITY_SECONDS = 18 * 60;
const FAST_FINALITY_SECONDS = 60;
const FORWARDING_SECONDS = 90;

/** Bytecode presence of the Gateway wallet per chain, checked once per session window. */
const deployedCache = new TtlCache<boolean>(30 * 60_000);

interface GatewayMeta {
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

interface EstimateResponse {
  body?: { burnIntent: { maxBlockHeight: string; maxFee: string; spec: TransferSpecJson } }[];
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

function spec(meta: GatewayMeta, depositor: Address, recipient: Address, value: bigint, salt: Hex): TransferSpecJson {
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

/**
 * Circle Gateway: deposit USDC into the Gateway wallet on the source chain,
 * wait for finality, sign an EIP-712 burn intent, and let Circle's forwarder
 * mint on the destination (no destination gas). Fees come from /v1/estimate
 * and are taken from the deposited amount, so the recipient gets
 * amountIn − maxFee.
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
      const burn = fromAsset ? burnTokenFor(fromAsset) : undefined;
      const srcDomain = CCTP_DOMAINS.find((d) => d.chainId === src.id)?.domain;
      if (!fromAsset || !burn || srcDomain === undefined) continue;
      if (!(await isDeployed(ctx.clients.get(src.id), src.id))) continue;
      for (const dst of chains) {
        if (dst.id === src.id) continue;
        const toAsset = usdcAsset(dst.id);
        const dstToken = toAsset ? burnTokenFor(toAsset) : undefined;
        const dstDomain = CCTP_DOMAINS.find((d) => d.chainId === dst.id)?.domain;
        if (!toAsset || !dstToken || dstDomain === undefined) continue;
        const from = nodeFromAsset(fromAsset);
        const to = nodeFromAsset(toAsset);
        const meta: GatewayMeta = {
          fromChainId: src.id,
          toChainId: dst.id,
          sourceDomain: srcDomain,
          destinationDomain: dstDomain,
          sourceToken: burn.address,
          sourceTokenDecimals: burn.decimals,
          destinationToken: dstToken.address,
        };
        const fast = CIRCLE_GATEWAY_TESTNET.fastFinalityChainIds.includes(src.id);
        edges.push({
          id: edgeId("circle-gateway", "CIRCLE_GATEWAY", from, to),
          provider: "circle-gateway",
          type: "CIRCLE_GATEWAY",
          from,
          to,
          crossChain: true,
          requiresApproval: true,
          requiresSourceGas: true,
          requiresDestinationGas: false,
          outputCanonicality: toAsset.kind === "NATIVE" ? "NATIVE" : "CANONICAL",
          reliabilityClass: "ISSUER",
          baselineGasUnits: 160_000n,
          baselineSeconds: (fast ? FAST_FINALITY_SECONDS : SLOW_FINALITY_SECONDS) + FORWARDING_SECONDS,
          source: SOURCES.circleGateway,
          trustMetadata: { issuerApproved: true, sourceRegistry: "Circle Gateway (unified USDC balance)" },
          meta: meta as unknown as Record<string, unknown>,
        });
      }
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as GatewayMeta;
    const fromAsset = assetById(req.assets, req.edge.from.assetId);
    const toAsset = assetById(req.assets, req.edge.to.assetId);
    const usdcIn = scaleDecimals(req.amountIn, fromAsset.decimals, meta.sourceTokenDecimals);
    if (usdcIn <= 0n) return null;
    let estimate: EstimateResponse;
    try {
      estimate = await fetchJson<EstimateResponse>(
        req.fetch,
        `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/estimate?enableForwarder=true`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ spec: spec(meta, req.wallet, req.recipient, usdcIn, randomSalt()) }]) },
        20_000,
        1,
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) return null;
      throw err;
    }
    const intent = Array.isArray(estimate) ? (estimate as EstimateResponse["body"])?.[0] : estimate.body?.[0];
    if (!intent) return null;
    const maxFee = BigInt(intent.burnIntent.maxFee);
    if (maxFee >= usdcIn) return null;
    const usdcOut = usdcIn - maxFee;
    const fast = CIRCLE_GATEWAY_TESTNET.fastFinalityChainIds.includes(meta.fromChainId);
    const fees = Array.isArray(estimate) ? undefined : estimate.fees;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: `Gateway deposit → forwarded mint · fee ${(Number(maxFee) / 1e6).toFixed(4)} USDC${fees?.forwardingFee ? ` (incl. forwarding ${fees.forwardingFee})` : ""} · finality ${fast ? "seconds" : "~15 min"}`,
      quote: {
        provider: "circle-gateway",
        amountIn: req.amountIn,
        amountOut: scaleDecimals(usdcOut, meta.sourceTokenDecimals, toAsset.decimals),
        minAmountOut: scaleDecimals(usdcOut, meta.sourceTokenDecimals, toAsset.decimals),
        feeOut: scaleDecimals(maxFee, meta.sourceTokenDecimals, toAsset.decimals),
        estimatedGasUnits: 160_000n,
        estimatedSeconds: req.edge.baselineSeconds,
        txCount: 2,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: { usdcIn: usdcIn.toString(), maxFee: maxFee.toString(), maxBlockHeight: intent.burnIntent.maxBlockHeight },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as GatewayMeta;
    const raw = edge.quote.raw as { maxFee: string };
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const client = ctx.clients.get(meta.fromChainId);
    const usdcIn = scaleDecimals(ctx.amountIn, fromAsset.decimals, meta.sourceTokenDecimals);
    const maxFee = BigInt(raw.maxFee);
    const value = usdcIn - maxFee;
    if (value <= 0n) throw new Error("Gateway fee exceeds the amount");
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

    // Available balance before the deposit, so finality is detected as an increase.
    let availableBefore = 0n;
    try {
      const balances = await fetchJson<BalancesResponse>(
        ctx.fetch,
        `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/balances`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "USDC", sources: [{ domain: meta.sourceDomain, depositor: ctx.wallet }] }) },
        15_000,
        1,
      );
      availableBefore = parseUsdc(balances.balances?.[0]?.balance ?? "0");
    } catch {
      availableBefore = 0n;
    }

    steps.push({
      id: stepId(edge.id, "deposit"),
      type: "BRIDGE",
      chainId: meta.fromChainId,
      provider: "circle-gateway",
      edgeId: edge.id,
      label: `Gateway deposit on ${findChain(meta.fromChainId)?.shortName ?? meta.fromChainId}`,
      status: "PENDING",
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
    steps.push({
      id: stepId(edge.id, "finality"),
      type: "WAIT_ATTESTATION",
      chainId: meta.fromChainId,
      provider: "circle-gateway",
      edgeId: edge.id,
      label: "Deposit finality (Gateway balance)",
      status: "PENDING",
      pollIntervalMs: 20_000,
      poll: { stage: "finality", sourceDomain: meta.sourceDomain, needed: (availableBefore + usdcIn).toString() },
    });

    const salt = randomSalt();
    const transferSpec = spec(meta, ctx.wallet, ctx.recipient, value, salt);
    const typedData: TypedDataPayload = {
      domain: { name: CIRCLE_GATEWAY_TESTNET.eip712.name, version: CIRCLE_GATEWAY_TESTNET.eip712.version },
      types: {
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
      },
      primaryType: "BurnIntent",
      message: {
        maxBlockHeight: MAX_UINT256,
        maxFee,
        spec: { ...transferSpec, value },
      },
    };
    steps.push({
      id: stepId(edge.id, "intent"),
      type: "PERMIT",
      chainId: meta.fromChainId,
      provider: "circle-gateway",
      edgeId: edge.id,
      label: "Sign Gateway burn intent (EIP-712)",
      status: "PENDING",
      summary: `BurnIntent: ${value} USDC units from domain ${meta.sourceDomain} to ${ctx.recipient} on domain ${meta.destinationDomain}, maxFee ${maxFee}, no expiry`,
      typedData,
    });
    steps.push({
      id: stepId(edge.id, "transfer"),
      type: "WAIT_ATTESTATION",
      chainId: meta.toChainId,
      provider: "circle-gateway",
      edgeId: edge.id,
      label: "Gateway attestation and forwarded mint",
      status: "PENDING",
      pollIntervalMs: 10_000,
      poll: { stage: "transfer", burnIntent: { maxBlockHeight: MAX_UINT256.toString(), maxFee: maxFee.toString(), spec: transferSpec }, expectedOut: value.toString() },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as GatewayMeta;
    const poll = (exec.poll ?? {}) as {
      stage?: string;
      needed?: string;
      burnIntent?: { maxBlockHeight: string; maxFee: string; spec: TransferSpecJson };
      permitSignature?: Hex;
      transferId?: string;
      expectedOut?: string;
    };
    const toAsset = exec.edge.to;
    const outDecimals = findChain(toAsset.chainId)?.nativeAsset.erc20Mirror && toAsset.representation === "NATIVE" ? 18 : 6;

    if (poll.stage === "finality") {
      const balances = await fetchJson<BalancesResponse>(
        exec.fetch,
        `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/balances`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "USDC", sources: [{ domain: meta.sourceDomain, depositor: exec.wallet }] }) },
        15_000,
        1,
      );
      const available = parseUsdc(balances.balances?.[0]?.balance ?? "0");
      const needed = BigInt(poll.needed ?? "0");
      if (available >= needed) return { kind: "COMPLETED", detail: `Deposit finalized: ${(Number(available) / 1e6).toFixed(6)} USDC available in Gateway` };
      return { kind: "PENDING", detail: `Waiting for deposit finality (${(Number(available) / 1e6).toFixed(6)} of ${(Number(needed) / 1e6).toFixed(6)} USDC available)` };
    }

    if (poll.stage === "transfer") {
      if (!poll.burnIntent) return { kind: "FAILED", detail: "Burn intent missing from the step" };
      if (!poll.permitSignature) return { kind: "PENDING", detail: "Waiting for the burn intent signature" };
      let transferId = poll.transferId;
      if (!transferId) {
        const res = await fetchJson<TransferResponse>(
          exec.fetch,
          `${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/transfer?enableForwarder=true`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ burnIntent: poll.burnIntent, signature: poll.permitSignature }]) },
          30_000,
          0,
        );
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
