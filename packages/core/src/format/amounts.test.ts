import { describe, expect, it } from "vitest";
import { applyBps, formatAmount, mulFloat, parseAmount, ratio, scaleDecimals } from "./amounts";

describe("amount helpers", () => {
  it("formats tiny testnet balances with significant digits", () => {
    expect(formatAmount(720_000_000_000_000n, 18)).toBe("0.00072");
    expect(formatAmount(3_120_000_000_000n, 18)).toBe("0.00000312");
    expect(formatAmount(14_200_000_000_000_000_000n, 18)).toBe("14.2");
    expect(formatAmount(4_820_000n, 6)).toBe("4.82");
    expect(formatAmount(0n, 6)).toBe("0");
    expect(formatAmount(1_234_567_000_000n, 6)).toBe("1 234 567");
  });

  it("applies slippage in basis points", () => {
    expect(applyBps(10_000n, 100)).toBe(9_900n);
    expect(applyBps(10_000n, 0)).toBe(10_000n);
  });

  it("scales Arc native 18-decimal USDC to the 6-decimal ERC-20 interface and back", () => {
    const native = parseAmount("7.5", 18);
    expect(scaleDecimals(native, 18, 6)).toBe(7_500_000n);
    expect(scaleDecimals(7_500_000n, 6, 18)).toBe(native);
    // flooring: sub-6-decimal dust is dropped, never rounded up
    expect(scaleDecimals(7_500_000_999_999_999_999n, 18, 6)).toBe(7_500_000n);
  });

  it("multiplies bigints by float factors", () => {
    expect(mulFloat(1_000_000n, 1.25)).toBe(1_250_000n);
    expect(ratio(50n, 200n)).toBeCloseTo(0.25);
  });
});
