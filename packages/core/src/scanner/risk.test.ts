import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeFunctionResult, keccak256, parseAbi, type Hex, type PublicClient } from "viem";
import { SANITY_HOLDER, checkTransferSanity, mappingSlot } from "./risk";

const multicall3Abi = parseAbi([
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)",
]);

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const ONE_K = 10n ** 18n * 1000n;

function fakeClient(opts: { slot: number; transferOk: boolean; received: bigint; returnsBool?: boolean }): PublicClient {
  const expected = mappingSlot(SANITY_HOLDER, opts.slot, "solidity");
  return {
    call: async ({ to, stateOverride }: { to: string; data: Hex; stateOverride?: { stateDiff: { slot: Hex; value: Hex }[] }[] }) => {
      const injected = stateOverride?.[0]?.stateDiff[0];
      const hit = injected?.slot === expected;
      if (to.toLowerCase() === TOKEN) {
        // balanceOf(holder) probe: only the right slot "sees" the injected balance
        return { data: (hit ? injected?.value : `0x${"0".repeat(64)}`) as Hex };
      }
      // aggregate3: transfer + balanceOf(recipient)
      const transferData = (opts.returnsBool === false ? "0x" : `0x${(opts.transferOk ? "1" : "0").padStart(64, "0")}`) as Hex;
      const data = encodeFunctionResult({
        abi: multicall3Abi,
        functionName: "aggregate3",
        result: [
          { success: opts.transferOk, returnData: transferData },
          { success: true, returnData: `0x${opts.received.toString(16).padStart(64, "0")}` as Hex },
        ],
      });
      return { data };
    },
  } as unknown as PublicClient;
}

describe("transfer sanity check", () => {
  it("computes solidity and vyper mapping slots", () => {
    const sol = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [SANITY_HOLDER, 3n]));
    expect(mappingSlot(SANITY_HOLDER, 3, "solidity")).toBe(sol);
    expect(mappingSlot(SANITY_HOLDER, 3, "vyper")).not.toBe(sol);
  });

  it("passes a plain token, flags fee-on-transfer and blocked transfers", async () => {
    expect((await checkTransferSanity(fakeClient({ slot: 2, transferOk: true, received: ONE_K }), TOKEN, 18)).transfer).toBe("ok");
    const fee = await checkTransferSanity(fakeClient({ slot: 5, transferOk: true, received: (ONE_K * 95n) / 100n }), TOKEN, 18);
    expect(fee.transfer).toBe("fee");
    expect(fee.feeBps).toBe(500);
    expect((await checkTransferSanity(fakeClient({ slot: 0, transferOk: false, received: 0n }), TOKEN, 18)).transfer).toBe("blocked");
    expect((await checkTransferSanity(fakeClient({ slot: 1, transferOk: true, received: 0n }), TOKEN, 18)).transfer).toBe("blocked");
  });

  it("reports unknown when the balance slot cannot be found", async () => {
    const r = await checkTransferSanity(fakeClient({ slot: 40, transferOk: true, received: ONE_K }), TOKEN, 18);
    expect(r.transfer).toBe("unknown");
  });
});
