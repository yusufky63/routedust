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
    if (received >= amount) return { transfer: "ok", checkedAt, balanceSlot: slot };
    const feeBps = Number(((amount - received) * 10_000n) / amount);
    return { transfer: received === 0n ? "blocked" : "fee", feeBps, checkedAt, detail: `${feeBps / 100}% lost on a plain transfer`, balanceSlot: slot };
  } catch (err) {
    return { transfer: "unknown", checkedAt, detail: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
}

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

/** Storage slot of `mapping(address => mapping(address => uint256))[owner][spender]` (Solidity layout). */
export function nestedMappingSlot(owner: Address, spender: Address, slot: number): Hex {
  const inner = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, BigInt(slot)]));
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender, inner]));
}

async function findAllowanceSlot(client: PublicClient, token: Address, spender: Address, amount: bigint, maxSlot = 16): Promise<Hex | undefined> {
  const value = numberToHex(amount, { size: 32 });
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [SANITY_HOLDER, spender] });
  for (let slot = 0; slot < maxSlot; slot += 1) {
    const storageSlot = nestedMappingSlot(SANITY_HOLDER, spender, slot);
    try {
      const res = await client.call({ to: token, data, stateOverride: [{ address: token, stateDiff: [{ slot: storageSlot, value }] }] });
      if (res.data && BigInt(res.data) === amount) return storageSlot;
    } catch {
      // keep probing
    }
  }
  return undefined;
}

export interface SwapSanityInput {
  token: Address;
  decimals: number;
  /** Uniswap v3 SwapRouter02 and the counter asset of a live pool. */
  router: Address;
  tokenOut: Address;
  fee: number;
  /** Quoter output for `amountIn`, to detect in-pool taxes. */
  expectedOut: bigint;
  amountIn: bigint;
  /** Known balance slot (from checkTransferSanity) to skip probing. */
  balanceSlot?: Hex;
}

/**
 * Sale simulation with state overrides: give Multicall3 a balance and a router
 * allowance, then run the real exactInputSingle through it. Catches tokens
 * whose transfer works but whose swap reverts or loses value inside the pool
 * (transfer taxes applied on pool transfers, blacklisted routers).
 */
export async function checkSwapSanity(client: PublicClient, input: SwapSanityInput): Promise<{ sell: "ok" | "blocked" | "fee" | "unknown"; detail?: string; amountOut?: bigint }> {
  try {
    const balanceSlot = input.balanceSlot ?? (await findBalanceSlot(client, input.token, input.amountIn));
    if (!balanceSlot) return { sell: "unknown", detail: "balance slot not found" };
    const allowanceSlot = await findAllowanceSlot(client, input.token, input.router, input.amountIn);
    if (!allowanceSlot) return { sell: "unknown", detail: "allowance slot not found" };
    const swap = encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn: input.token, tokenOut: input.tokenOut, fee: input.fee, recipient: SANITY_HOLDER, amountIn: input.amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
    });
    const res = await client.call({
      to: SANITY_HOLDER,
      data: encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [[{ target: input.router, allowFailure: true, callData: swap }]] }),
      stateOverride: [
        {
          address: input.token,
          stateDiff: [
            { slot: balanceSlot, value: numberToHex(input.amountIn, { size: 32 }) },
            { slot: allowanceSlot, value: numberToHex(input.amountIn, { size: 32 }) },
          ],
        },
      ],
    });
    if (!res.data) return { sell: "unknown", detail: "empty response" };
    const [results] = [decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: res.data })];
    const r = results[0];
    if (!r?.success) return { sell: "blocked", detail: "router swap reverted with a funded, approved holder" };
    const amountOut = r.returnData !== "0x" ? BigInt(r.returnData) : 0n;
    if (amountOut === 0n) return { sell: "blocked", detail: "router swap returned nothing" };
    if (input.expectedOut > 0n && amountOut * 100n < input.expectedOut * 95n) {
      const lossBps = Number(((input.expectedOut - amountOut) * 10_000n) / input.expectedOut);
      return { sell: "fee", detail: `${lossBps / 100}% less than the quoter inside the pool`, amountOut };
    }
    return { sell: "ok", amountOut };
  } catch (err) {
    return { sell: "unknown", detail: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
}
