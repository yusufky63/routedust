import { describe, expect, it } from "vitest";
import { computeGasReserve, usableNative } from "./reserve";

describe("gas reserve", () => {
  it("reserves gas units * fee * safety and reports usable native", () => {
    const info = computeGasReserve({
      nativeBalance: 720_000_000_000_000n, // 0.00072 ETH
      estimatedGasUnits: 300_000n,
      maxFeePerGas: 1_000_000_000n, // 1 gwei
      safetyMultiplier: 1.25,
    });
    expect(info.reserve).toBe(375_000_000_000_000n); // 0.000375 ETH
    expect(info.shortfall).toBe(0n);
    expect(usableNative(info)).toBe(345_000_000_000_000n);
  });

  it("reports the shortfall when the balance cannot cover the reserve", () => {
    const info = computeGasReserve({
      nativeBalance: 100_000_000_000_000n,
      estimatedGasUnits: 300_000n,
      maxFeePerGas: 1_000_000_000n,
      safetyMultiplier: 1.25,
    });
    expect(info.shortfall).toBe(275_000_000_000_000n);
    expect(usableNative(info)).toBe(0n);
  });
});
