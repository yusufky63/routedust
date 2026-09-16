/**
 * Thrown by a provider quote when the requested amount exceeds what the
 * provider can take right now (liquidity, deposit cap). `maxAmountIn` is in
 * the edge's input-asset units so the planner can propose a partial route.
 */
export class QuoteLimitError extends Error {
  constructor(
    message: string,
    public readonly maxAmountIn: bigint,
  ) {
    super(message);
    this.name = "QuoteLimitError";
  }
}
