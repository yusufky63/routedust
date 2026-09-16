import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  numberToHex,
  parseAbi,
  type Hex,
  type PublicClient,
} from "viem";
import type { TokenRisk } from "../types/asset";
import type { Address } from "../types/common";

/** Multicall3 is both the fake holder and the caller: transfer's msg.sender must own the injected balance. */
export const SANITY_HOLDER = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
const RECIPIENT = "0x000000000000000000000000000000000000beef" as Address;

const multicall3Abi = parseAbi([
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)",
]);

/** Storage slot of `mapping(address => uint256)[key]` for Solidity and Vyper layouts. */
export function mappingSlot(key: Address, slot: number, layout: "solidity" | "vyper"): Hex {
  const k = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [key, BigInt(slot)]);
  if (layout === "solidity") return keccak256(k);
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [BigInt(slot), key]));
}

async function findBalanceSlot(client: PublicClient, token: Address, amount: bigint, maxSlot = 16): Promise<Hex | undefined> {
  const value = numberToHex(amount, { size: 32 });
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [SANITY_HOLDER] });
  for (let slot = 0; slot < maxSlot; slot += 1) {
    for (const layout of ["solidity", "vyper"] as const) {
      const storageSlot = mappingSlot(SANITY_HOLDER, slot, layout);
      try {
        const res = await client.call({
          to: token,
          data,
          stateOverride: [{ address: token, stateDiff: [{ slot: storageSlot, value }] }],
        });
        if (res.data && BigInt(res.data) === amount) return storageSlot;
      } catch {
        // unsupported override / revert: keep probing
      }
    }
  }
  return undefined;
}

/**
 * Honeypot / fee-on-transfer sanity check without owning the token: inject a
 * balance for Multicall3 via eth_call state override, transfer it, and read
 * what arrived. "unknown" when the RPC lacks state override or the balance
 * slot cannot be located (never treated as a pass).
 */
export async function checkTransferSanity(client: PublicClient, token: Address, decimals: number): Promise<TokenRisk> {
  const checkedAt = Date.now();
  const amount = 10n ** BigInt(Math.min(decimals, 30)) * 1000n; // 1000 tokens
  let slot: Hex | undefined;
  try {
    slot = await findBalanceSlot(client, token, amount);
  } catch (err) {
    return { transfer: "unknown", checkedAt, detail: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
  if (!slot) return { transfer: "unknown", checkedAt, detail: "balance storage slot not found (proxy or non-standard layout)" };

  const calls = [
    { target: token, allowFailure: true, callData: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [RECIPIENT, amount] }) },
    { target: token, allowFailure: true, callData: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [RECIPIENT] }) },
  ];
  try {
    const res = await client.call({
      to: SANITY_HOLDER,
      data: encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [calls] }),
      stateOverride: [{ address: token, stateDiff: [{ slot, value: numberToHex(amount, { size: 32 }) }] }],
    });
    if (!res.data) return { transfer: "unknown", checkedAt, detail: "empty multicall response" };
    const [results] = [decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: res.data })];
    const transfer = results[0];
    const balance = results[1];
    if (!transfer?.success) return { transfer: "blocked", checkedAt, detail: "transfer reverted" };
    if (transfer.returnData !== "0x" && BigInt(transfer.returnData) === 0n) return { transfer: "blocked", checkedAt, detail: "transfer returned false" };
    const received = balance?.success && balance.returnData !== "0x" ? BigInt(balance.returnData) : 0n;
    if (received >= amount) return { transfer: "ok", checkedAt };
    const feeBps = Number(((amount - received) * 10_000n) / amount);
    return { transfer: received === 0n ? "blocked" : "fee", feeBps, checkedAt, detail: `${feeBps / 100}% lost on a plain transfer` };
  } catch (err) {
    return { transfer: "unknown", checkedAt, detail: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
}
