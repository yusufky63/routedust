import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { cctpExpirationBlock } from "./provider";

const word = (v: bigint) => v.toString(16).padStart(64, "0");

describe("circle-cctp", () => {
  it("reads expirationBlock from a V2 burn message (header 148 bytes, body word 7)", () => {
    const header = "00".repeat(148);
    const body = (expiration: bigint) => `00000001${word(1n)}${word(2n)}${word(50_000n)}${word(3n)}${word(5n)}${word(4n)}${word(expiration)}`;
    expect(cctpExpirationBlock(`0x${header}${body(11_731_574n)}` as Hex)).toBe(11_731_574n);
    expect(cctpExpirationBlock(`0x${header}${body(0n)}beef` as Hex)).toBe(0n);
    expect(cctpExpirationBlock("0x")).toBe(0n);
  });
});
