import { ratio } from "../format/amounts";
import type { PlannerLimits, ReliabilityClass, RouteCandidate, RouteMode, ScoreBreakdown } from "../types/route";

export interface ModeWeights {
  output: number;
  gas: number;
  protocolFee: number;
  slippage: number;
  latency: number;
  txCount: number;
  reliability: number;
  wrappedOutput: number;
}

export const MODE_WEIGHTS: Record<RouteMode, ModeWeights> = {
  // Output dominates: testnet routes differ by well under 1% in output, so
  // secondary penalties must stay small or they silently override the objective.
  BEST_OUTPUT: {
    output: 1.0,
    gas: 0.02,
    protocolFee: 0.02,
    slippage: 0.02,
    latency: 0.01,
    txCount: 0.01,
    reliability: 0.1,
    wrappedOutput: 0.5,
  },
  FEWEST_TX: {
    output: 0.5,
    gas: 0.1,
    protocolFee: 0.05,
    slippage: 0.05,
    latency: 0.05,
    txCount: 0.7,
    reliability: 0.2,
    wrappedOutput: 0.5,
  },
  FASTEST: {
    output: 0.5,
    gas: 0.05,
    protocolFee: 0.05,
    slippage: 0.05,
    latency: 0.8,
    txCount: 0.1,
    reliability: 0.25,
    wrappedOutput: 0.5,
  },
  NATIVE_ONLY: {
    output: 1.0,
    gas: 0.02,
    protocolFee: 0.02,
    slippage: 0.02,
    latency: 0.01,
    txCount: 0.01,
    reliability: 0.15,
    wrappedOutput: 10,
  },
  MAX_COVERAGE: {
    output: 0.4,
    gas: 0.1,
    protocolFee: 0.05,
    slippage: 0.05,
    latency: 0.05,
    txCount: 0.35,
    reliability: 0.15,
    wrappedOutput: 0.4,
  },
};

export const RELIABILITY_PENALTY: Record<ReliabilityClass, number> = {
  CANONICAL: 0,
  ISSUER: 0.05,
  LIQUIDITY: 0.3,
  BEST_EFFORT_TESTNET: 0.6,
};

export const MODE_LABELS: Record<RouteMode, string> = {
  BEST_OUTPUT: "Best Output",
  FEWEST_TX: "Fewest Transactions",
  FASTEST: "Fastest",
  NATIVE_ONLY: "Native Only",
  MAX_COVERAGE: "Max Coverage",
};

function maxBig(values: bigint[]): bigint {
  let m = 0n;
  for (const v of values) if (v > m) m = v;
  return m;
}

function maxNum(values: number[]): number {
  let m = 0;
  for (const v of values) if (v > m) m = v;
  return m;
}

/**
 * Scores candidates that share the same source asset. Output is normalised
 * against the best candidate of the set: nominal USD is never used because
 * testnet assets have intentionally undefined real-world value.
 *
 * Mutates candidates in place (score, scoreBreakdown, excludedBy) and returns
 * them sorted best-first with excluded candidates last.
 */
export function scoreCandidates(
  candidates: RouteCandidate[],
  mode: RouteMode,
  limits: Pick<PlannerLimits, "allowWrappedOutput">,
): RouteCandidate[] {
  if (candidates.length === 0) return candidates;
  const w = MODE_WEIGHTS[mode];
  const maxOut = maxBig(candidates.map((c) => c.amountOut));
  const maxGas = maxBig(candidates.map((c) => c.sourceGasUnits));
  const maxLatency = maxNum(candidates.map((c) => c.estimatedSeconds));
  const maxTx = maxNum(candidates.map((c) => c.txCount));

  for (const c of candidates) {
    const normalizedOutput = ratio(c.amountOut, maxOut);
    const gasPenalty = w.gas * ratio(c.sourceGasUnits, maxGas);
    const feeOut = c.edges.reduce((acc, e) => acc + e.quote.feeOut, 0n);
    const protocolFeePenalty = w.protocolFee * ratio(feeOut, c.amountOut + feeOut);
    const slippagePenalty = w.slippage * ratio(c.amountOut - c.minAmountOut, c.amountOut);
    const latencyPenalty = maxLatency > 0 ? w.latency * (c.estimatedSeconds / maxLatency) : 0;
    const txCountPenalty = maxTx > 0 ? w.txCount * (c.txCount / maxTx) : 0;
    const reliabilityPenalty = w.reliability * RELIABILITY_PENALTY[c.reliabilityClass];
    const wrapped = c.outputCanonicality === "WRAPPED";
    const wrappedOutputPenalty = wrapped ? w.wrappedOutput : 0;

    const total =
      w.output * normalizedOutput -
      gasPenalty -
      protocolFeePenalty -
      slippagePenalty -
      latencyPenalty -
      txCountPenalty -
      reliabilityPenalty -
      wrappedOutputPenalty;

    const breakdown: ScoreBreakdown = {
      normalizedOutput,
      gasPenalty,
      protocolFeePenalty,
      slippagePenalty,
      latencyPenalty,
      txCountPenalty,
      reliabilityPenalty,
      wrappedOutputPenalty,
      total,
    };
    c.score = total;
    c.scoreBreakdown = breakdown;

    c.excludedBy = undefined;
    if (wrapped && (mode === "NATIVE_ONLY" || !limits.allowWrappedOutput)) {
      c.excludedBy = mode === "NATIVE_ONLY" ? "NATIVE_ONLY" : "WRAPPED_OUTPUT_DISABLED";
    }
    if (c.health === "UNAVAILABLE") {
      c.excludedBy = "UNAVAILABLE";
    }
  }

  return [...candidates].sort((a, b) => {
    const ax = a.excludedBy ? 1 : 0;
    const bx = b.excludedBy ? 1 : 0;
    if (ax !== bx) return ax - bx;
    return (b.score ?? -Infinity) - (a.score ?? -Infinity);
  });
}

export function selectBest(candidates: RouteCandidate[]): RouteCandidate | undefined {
  return candidates.find((c) => !c.excludedBy);
}
