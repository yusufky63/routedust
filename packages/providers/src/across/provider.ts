import { encodeFunctionData, erc20Abi, parseAbi, parseUnits, type Hex } from "viem";
import {
  QuoteLimitError,
  nodeFromAsset,
  type Address,
  type Asset,
  type CapabilityEdge,
  type ExecutionStep,
  type RouteEdge,
  type RouteProvider,
} from "@testnet-router/core";
import { ACROSS_TESTNET, ASSETS, nativeAsset, usdcAsset, wrappedNative } from "@testnet-router/registry";
import { HttpError, ZERO_ADDRESS, approvalStepIfNeeded, assetById, edgeId, fetchJson, nowSeconds, runtimeSource, stepId } from "../shared";

const spokePoolAbi = parseAbi([
  "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes message) payable",
]);

interface AvailableRoute {
  originChainId: number;
  originToken: Address;
  destinationChainId: number;
  destinationToken: Address;
  originTokenSymbol?: string;
  destinationTokenSymbol?: string;
  isNative?: boolean;
}

interface SuggestedFees {
  totalRelayFee: { pct: string; total: string };
  relayerCapitalFee?: { total: string };
  relayerGasFee?: { total: string };
  lpFee?: { total: string };
  timestamp: string;
  isAmountTooLow: boolean;
  spokePoolAddress: Address;
  exclusiveRelayer: Address;
  exclusivityDeadline: number;
  fillDeadline?: string;
  estimatedFillTimeSec?: number;
  limits?: { minDeposit: string; maxDeposit: string };
}

interface AcrossMeta {
  originChainId: number;
  destinationChainId: number;
  originToken: Address;
  destinationToken: Address;
  isNative: boolean;
}

const QUOTE_TTL_MS = 3 * 60_000;

/** Map an Across token address on a chain to a registry asset. */
function matchAsset(chainId: number, token: Address, isNative: boolean): Asset | undefined {
  if (isNative) return nativeAsset(chainId);
  const lower = token.toLowerCase();
  const usdc = usdcAsset(chainId);
  if (usdc?.address?.toLowerCase() === lower) return usdc;
  const wrapped = wrappedNative(chainId);
  if (wrapped?.address?.toLowerCase() === lower) return wrapped;
  return ASSETS.find((a) => a.chainId === chainId && a.address?.toLowerCase() === lower);
}

/**
 * Across testnet intents. Routes are discovered from /available-routes at
 * runtime and always flagged BEST_EFFORT_TESTNET (spec section 8).
 */
export const acrossProvider: RouteProvider = {
  key: "across",
  name: "Across (testnet)",
  source: ACROSS_TESTNET.source,

  async discover(ctx) {
    const routes = await fetchJson<AvailableRoute[]>(ctx.fetch, `${ACROSS_TESTNET.apiBase}/available-routes`, undefined, 20_000);
    const known = new Set(ctx.chains.map((c) => c.id));
    const edges: CapabilityEdge[] = [];
    const source = runtimeSource(`${ACROSS_TESTNET.apiBase}/available-routes`, `${routes.length} routes returned`);
    for (const r of routes) {
      if (!known.has(r.originChainId) || !known.has(r.destinationChainId)) continue;
      const isNative = Boolean(r.isNative);
      const fromAsset = matchAsset(r.originChainId, r.originToken, isNative);
      const toAsset = matchAsset(r.destinationChainId, r.destinationToken, isNative);
      if (!fromAsset || !toAsset) continue;
      // Same canonical asset only (ETH->ETH, USDC->USDC, WETH->WETH); cross-asset fills are not modelled yet.
      if (fromAsset.canonicalAssetId !== toAsset.canonicalAssetId) continue;
      const from = nodeFromAsset(fromAsset);
      const to = nodeFromAsset(toAsset);
      const meta: AcrossMeta = {
        originChainId: r.originChainId,
        destinationChainId: r.destinationChainId,
        originToken: r.originToken,
        destinationToken: r.destinationToken,
        isNative,
      };
      edges.push({
        id: edgeId("across", "ACROSS", from, to),
        provider: "across",
        type: "ACROSS",
        from,
        to,
        crossChain: true,
        requiresApproval: !isNative,
        requiresSourceGas: true,
        requiresDestinationGas: false,
        outputCanonicality:
          toAsset.kind === "NATIVE" ? "NATIVE" : toAsset.representation === "WRAPPED_NATIVE" ? "WRAPPED" : "CANONICAL",
        reliabilityClass: "BEST_EFFORT_TESTNET",
        baselineGasUnits: 180_000n,
        baselineSeconds: 120,
        source,
        trustMetadata: { sourceRegistry: "Across testnet API", registryProvenance: "official-registry" },
        meta: meta as unknown as Record<string, unknown>,
      });
    }
    return edges;
  },

  async quote(req) {
    const meta = req.edge.meta as unknown as AcrossMeta;
    const params = new URLSearchParams({
      inputToken: meta.originToken,
      outputToken: meta.destinationToken,
      originChainId: String(meta.originChainId),
      destinationChainId: String(meta.destinationChainId),
      amount: req.amountIn.toString(),
      recipient: req.recipient,
    });
    let fees: SuggestedFees;
    try {
      fees = await fetchJson<SuggestedFees>(req.fetch, `${ACROSS_TESTNET.apiBase}/suggested-fees?${params.toString()}`);
    } catch (err) {
      if (err instanceof HttpError && err.code === "AMOUNT_TOO_HIGH") {
        const match = err.body.match(/Max amount is ([\d.]+) (\w+)/);
        const fromAsset = assetById(req.assets, req.edge.from.assetId);
        if (match?.[1]) {
          let maxAmountIn = 0n;
          try {
            maxAmountIn = parseUnits(match[1], fromAsset.decimals);
          } catch {
            maxAmountIn = 0n;
          }
          throw new QuoteLimitError(`amount above available Across liquidity (max ${match[1]} ${match[2]})`, maxAmountIn);
        }
        throw new Error("amount above available Across liquidity");
      }
      if (err instanceof HttpError && err.code === "AMOUNT_TOO_LOW") throw new Error("amount below Across minimum deposit");
      throw err;
    }
    if (fees.isAmountTooLow) throw new Error("amount below Across minimum deposit");
    const fee = BigInt(fees.totalRelayFee.total);
    if (fee >= req.amountIn) return null;
    const amountOut = req.amountIn - fee;
    const fillDeadline = fees.fillDeadline ? Number(fees.fillDeadline) : nowSeconds() + 2 * 3600;
    return {
      ...req.edge,
      health: "QUOTED",
      healthNote: "testnet relayer / best effort",
      quote: {
        provider: "across",
        amountIn: req.amountIn,
        amountOut,
        minAmountOut: amountOut,
        feeOut: fee,
        estimatedGasUnits: 170_000n,
        estimatedSeconds: fees.estimatedFillTimeSec ?? 120,
        txCount: 1,
        quotedAt: req.now,
        expiresAt: req.now + QUOTE_TTL_MS,
        raw: {
          spokePool: fees.spokePoolAddress,
          quoteTimestamp: Number(fees.timestamp),
          exclusiveRelayer: fees.exclusiveRelayer ?? ZERO_ADDRESS,
          exclusivityDeadline: Number(fees.exclusivityDeadline ?? 0),
          fillDeadline,
          outputAmount: amountOut.toString(),
        },
      },
    } satisfies RouteEdge;
  },

  async build(edge, ctx) {
    const meta = edge.meta as unknown as AcrossMeta;
    const raw = edge.quote.raw as {
      spokePool: Address;
      quoteTimestamp: number;
      exclusiveRelayer: Address;
      exclusivityDeadline: number;
      fillDeadline: number;
      outputAmount: string;
    };
    const fromAsset = assetById(ctx.assets, edge.from.assetId);
    const toAsset = assetById(ctx.assets, edge.to.assetId);
    const client = ctx.clients.get(meta.originChainId);
    const steps: ExecutionStep[] = [];
    const inputAmount = ctx.amountIn;
    const outputAmount =
      inputAmount === edge.quote.amountIn ? BigInt(raw.outputAmount) : inputAmount - (inputAmount * edge.quote.feeOut) / edge.quote.amountIn;

    if (!meta.isNative) {
      const approve = await approvalStepIfNeeded({
        client,
        chainId: meta.originChainId,
        token: meta.originToken,
        owner: ctx.wallet,
        spender: raw.spokePool,
        amount: inputAmount,
        provider: "across",
        edgeId: edge.id,
        symbol: fromAsset.symbol,
      });
      if (approve) steps.push(approve);
    }

    const dstClient = ctx.clients.get(meta.destinationChainId);
    const destBalanceBefore =
      toAsset.kind === "NATIVE" || !toAsset.address
        ? await dstClient.getBalance({ address: ctx.recipient })
        : await dstClient.readContract({ address: toAsset.address, abi: erc20Abi, functionName: "balanceOf", args: [ctx.recipient] });

    steps.push({
      id: stepId(edge.id, "deposit"),
      type: "BRIDGE",
      chainId: meta.originChainId,
      provider: "across",
      edgeId: edge.id,
      label: `Across deposit → chain ${meta.destinationChainId}`,
      status: "PENDING",
      simulate: true,
      summary: `SpokePool.depositV3(${inputAmount} units of ${fromAsset.symbol} → at least ${outputAmount} units on chain ${meta.destinationChainId}, recipient ${ctx.recipient}, fill deadline ${raw.fillDeadline})`,
      expiresAt: edge.quote.expiresAt,
      tx: {
        chainId: meta.originChainId,
        to: raw.spokePool,
        value: meta.isNative ? inputAmount : 0n,
        data: encodeFunctionData({
          abi: spokePoolAbi,
          functionName: "depositV3",
          args: [
            ctx.wallet,
            ctx.recipient,
            meta.originToken,
            meta.destinationToken,
            inputAmount,
            outputAmount,
            BigInt(meta.destinationChainId),
            raw.exclusiveRelayer,
            raw.quoteTimestamp,
            raw.fillDeadline,
            raw.exclusivityDeadline,
            "0x",
          ],
        }),
      },
    });
    steps.push({
      id: stepId(edge.id, "fill"),
      type: "WAIT_ATTESTATION",
      chainId: meta.destinationChainId,
      provider: "across",
      edgeId: edge.id,
      label: "Across relayer fill",
      status: "PENDING",
      pollIntervalMs: 10_000,
      poll: { destBalanceBefore: destBalanceBefore.toString(), expectedOut: outputAmount.toString() },
    });
    return steps;
  },

  async status(exec) {
    const meta = exec.edge.meta as unknown as AcrossMeta;
    // 1) Official deposit status endpoint (may be unavailable on testnet).
    try {
      const params = new URLSearchParams({ originChainId: String(meta.originChainId), depositTxHash: exec.sourceTxHash });
      const s = await fetchJson<{ status?: string; fillTx?: Hex; fillTxHash?: Hex }>(
        exec.fetch,
        `${ACROSS_TESTNET.apiBase}/deposit/status?${params.toString()}`,
        undefined,
        10_000,
      );
      if (s.status === "filled") return { kind: "FILLED", detail: "Filled by relayer", destinationTxHash: s.fillTx ?? s.fillTxHash };
      if (s.status === "expired" || s.status === "refunded") return { kind: "FAILED", detail: `Across deposit ${s.status}` };
    } catch {
      // fall through to balance polling
    }
    // 2) Destination balance polling fallback (snapshot captured at build time).
    const poll = (exec.poll ?? {}) as { destBalanceBefore?: string; expectedOut?: string };
    const dstClient = exec.clients.get(meta.destinationChainId);
    const balance = meta.isNative
      ? await dstClient.getBalance({ address: exec.recipient ?? exec.wallet })
      : await dstClient.readContract({ address: meta.destinationToken, abi: erc20Abi, functionName: "balanceOf", args: [exec.recipient ?? exec.wallet] });
    const expected = poll.expectedOut ? BigInt(poll.expectedOut) : 0n;
    if (poll.destBalanceBefore !== undefined && expected > 0n) {
      const delta = balance - BigInt(poll.destBalanceBefore);
      // Relayers may fill slightly under the quoted output; accept 95% of it.
      if (delta >= (expected * 95n) / 100n) {
        return { kind: "FILLED", detail: "Destination balance increased", amountOut: delta };
      }
    }
    return { kind: "PENDING", detail: "Waiting for a testnet relayer (best effort, may take minutes)" };
  },
};
