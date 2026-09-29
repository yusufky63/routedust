import { describe, expect, it } from "vitest";
import { MAX_TICK, MIN_TICK, fullRange, mintAmounts, sqrtPriceX96FromAmounts, sqrtRatioAtTick } from "./ticks";

describe("tick math", () => {
  it("matches TickMath at the anchors", () => {
    expect(sqrtRatioAtTick(0)).toBe(1n << 96n);
    expect(sqrtRatioAtTick(MIN_TICK)).toBe(4295128739n);
    expect(sqrtRatioAtTick(MAX_TICK)).toBe(1461446703485210103287273052203988822378723970342n);
    // One tick up is a factor of 1.0001 in price, so about 1.00005 in sqrt price.
    const up = Number(sqrtRatioAtTick(1)) / Number(1n << 96n);
    expect(up).toBeCloseTo(Math.sqrt(1.0001), 12);
  });

  it("uses the scarce side fully and the other one in proportion", () => {
    // Price 1:1, full range: 1000 of each sets liquidity; asking for 2000 of token1 still uses about 1000.
    const price = sqrtPriceX96FromAmounts(1_000_000n, 1_000_000n);
    const { tickLower, tickUpper } = fullRange(3000);
    const used = mintAmounts(price, tickLower, tickUpper, 1_000_000n, 2_000_000n);
    expect(used.amount0).toBeGreaterThan(999_000n);
    expect(used.amount0).toBeLessThanOrEqual(1_000_000n);
    expect(used.amount1).toBeGreaterThan(999_000n);
    expect(used.amount1).toBeLessThanOrEqual(1_000_000n);
  });

  it("takes only token1 when the price sits above the range", () => {
    const price = sqrtRatioAtTick(1000);
    const used = mintAmounts(price, -600, 600, 1_000_000n, 1_000_000n);
    expect(used.amount0).toBe(0n);
    expect(used.amount1).toBeGreaterThan(0n);
  });
});
