import { describe, expect, it } from "vitest";
import type { Asset, RouteCandidate, RouteEdge } from "../types";
import { scoreCandidates, selectBest } from "./score";

const asset: Asset = {
  id: "11155111:native",
  chainId: 11155111,
  canonicalAssetId: "ETH",
  kind: "NATIVE",
  decimals: 18,
  symbol: "ETH",
  name: "ETH",
  representation: "NATIVE",
  verified: true,
};

function edge(partial: Omit<Partial<RouteEdge>, "quote"> & { quote: Partial<RouteEdge["quote"]> }): RouteEdge {
  return {
    id: partial.id ?? "e",
    provider: partial.provider ?? "p",
    type: partial.type ?? "SWAP",
    from: { chainId: 1, canonicalAssetId: "A", representation: "NATIVE", assetId: "1:native" },
    to: { chainId: 1, canonicalAssetId: "B", representation: "CANONICAL", assetId: "1:b" },
    crossChain: false,
    requiresApproval: false,
    requiresSourceGas: true,
    requiresDestinationGas: false,
    outputCanonicality: partial.outputCanonicality ?? "CANONICAL",
    reliabilityClass: partial.reliabilityClass ?? "CANONICAL",
    baselineGasUnits: 100_000n,
    baselineSeconds: 30,
    source: { kind: "manual", url: "t", lastVerifiedAt: "2026-09-16T00:00:00Z" },
    health: "QUOTED",
    quote: {
      provider: "p",
      amountIn: 1_000n,
      amountOut: partial.quote.amountOut ?? 1_000n,
      minAmountOut: partial.quote.minAmountOut ?? partial.quote.amountOut ?? 1_000n,
      feeOut: partial.quote.feeOut ?? 0n,
      estimatedGasUnits: partial.quote.estimatedGasUnits ?? 100_000n,
      estimatedSeconds: partial.quote.estimatedSeconds ?? 30,
      txCount: partial.quote.txCount ?? 1,
      quotedAt: 0,
      expiresAt: 1,
    },
  };
}

function candidate(id: string, edges: RouteEdge[], overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  const last = edges[edges.length - 1] as RouteEdge;
  return {
    id,
    sourceChainId: 1,
    sourceAsset: asset,
    amountIn: 1_000n,
    destination: last.to,
    edges,
    amountOut: last.quote.amountOut,
    minAmountOut: last.quote.minAmountOut,
    txCount: edges.reduce((n, e) => n + e.quote.txCount, 0),
    swapCount: edges.filter((e) => e.type === "SWAP").length,
    bridgeCount: edges.filter((e) => e.crossChain).length,
    estimatedSeconds: edges.reduce((n, e) => n + e.quote.estimatedSeconds, 0),
    sourceGasUnits: edges.reduce((n, e) => n + e.quote.estimatedGasUnits, 0n),
    outputCanonicality: last.outputCanonicality,
    reliabilityClass: edges.some((e) => e.reliabilityClass === "BEST_EFFORT_TESTNET") ? "BEST_EFFORT_TESTNET" : "CANONICAL",
    requiresSourceGas: true,
    requiresDestinationGas: false,
    health: "QUOTED",
    ...overrides,
  };
}

describe("scoreCandidates", () => {
  const cctpPath = candidate("cctp", [
    edge({ id: "swap", type: "SWAP", quote: { amountOut: 5_900n, txCount: 1, estimatedSeconds: 20 } }),
    edge({ id: "cctp", type: "CCTP", quote: { amountOut: 5_840n, txCount: 2, estimatedSeconds: 900 } }),
  ]);
  const acrossPath = candidate("across", [
    edge({ id: "across", type: "ACROSS", reliabilityClass: "BEST_EFFORT_TESTNET", quote: { amountOut: 5_790n, txCount: 1, estimatedSeconds: 90 } }),
  ]);
  const wrappedPath = candidate("wrapped", [
    edge({ id: "wrapped", type: "WORMHOLE_WRAPPED", outputCanonicality: "WRAPPED", quote: { amountOut: 5_660n, txCount: 1, estimatedSeconds: 300 } }),
  ]);

  it("prefers the highest output in BEST_OUTPUT mode", () => {
    const ranked = scoreCandidates([cctpPath, acrossPath, wrappedPath].map((c) => ({ ...c })), "BEST_OUTPUT", { allowWrappedOutput: true });
    expect(ranked[0]?.id).toBe("cctp");
    expect(selectBest(ranked)?.id).toBe("cctp");
  });

  it("prefers fewer transactions in FEWEST_TX mode", () => {
    const ranked = scoreCandidates([cctpPath, acrossPath].map((c) => ({ ...c })), "FEWEST_TX", { allowWrappedOutput: true });
    expect(ranked[0]?.id).toBe("across");
  });

  it("prefers the fastest route in FASTEST mode", () => {
    const ranked = scoreCandidates([cctpPath, acrossPath].map((c) => ({ ...c })), "FASTEST", { allowWrappedOutput: true });
    expect(ranked[0]?.id).toBe("across");
  });

  it("excludes wrapped outputs under NATIVE_ONLY and when wrapped output is disabled", () => {
    const native = scoreCandidates([wrappedPath, cctpPath].map((c) => ({ ...c })), "NATIVE_ONLY", { allowWrappedOutput: true });
    expect(native.find((c) => c.id === "wrapped")?.excludedBy).toBe("NATIVE_ONLY");
    expect(selectBest(native)?.id).toBe("cctp");

    const disabled = scoreCandidates([wrappedPath].map((c) => ({ ...c })), "BEST_OUTPUT", { allowWrappedOutput: false });
    expect(disabled[0]?.excludedBy).toBe("WRAPPED_OUTPUT_DISABLED");
    expect(selectBest(disabled)).toBeUndefined();
  });

  it("exposes a full score breakdown", () => {
    const [c] = scoreCandidates([{ ...cctpPath }], "BEST_OUTPUT", { allowWrappedOutput: false });
    expect(c?.scoreBreakdown?.normalizedOutput).toBe(1);
    expect(c?.scoreBreakdown?.total).toBeLessThanOrEqual(1);
  });
});
