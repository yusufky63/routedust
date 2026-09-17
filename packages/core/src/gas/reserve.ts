import { mulFloat } from "../format/amounts";
import type { GasReserveInfo, RouteEdgeType } from "../types/route";

/**
 * Conservative baseline gas units per edge type, used to size the gas reserve
 * before live quotes exist. Providers refine these with quoted estimates.
 */
export const BASELINE_GAS_UNITS: Record<RouteEdgeType, bigint> = {
  WRAP: 60_000n,
  UNWRAP: 60_000n,
  SWAP: 220_000n,
  CCTP: 180_000n,
  CIRCLE_GATEWAY: 200_000n,
  OP_STANDARD_BRIDGE: 160_000n,
  SUPERCHAIN_INTEROP: 200_000n,
  ACROSS: 180_000n,
  LIFI: 300_000n,
  STARGATE: 350_000n,
  LAYERZERO_OFT: 350_000n,
  WORMHOLE_NTT: 350_000n,
  WORMHOLE_WRAPPED: 350_000n,
  HYPERLANE_WARP: 300_000n,
};

export const APPROVAL_GAS_UNITS = 60_000n;

export const DEFAULT_GAS_SAFETY_MULTIPLIER = 1.25;

export interface GasReserveInput {
  nativeBalance: bigint;
  estimatedGasUnits: bigint;
  maxFeePerGas: bigint;
  safetyMultiplier?: number;
  /** Native wei the source transactions carry as msg.value fees (relayer / interchain gas payments). */
  extraNativeWei?: bigint;
}

/**
 * gasReserve = (estimatedGasUnits * maxFeePerGas + extraNativeWei) * safetyMultiplier
 * usableNative = nativeBalance - gasReserve
 */
export function computeGasReserve(input: GasReserveInput): GasReserveInfo {
  const safety = input.safetyMultiplier ?? DEFAULT_GAS_SAFETY_MULTIPLIER;
  const rawCost = input.estimatedGasUnits * input.maxFeePerGas + (input.extraNativeWei ?? 0n);
  const reserve = mulFloat(rawCost, safety);
  const shortfall = input.nativeBalance >= reserve ? 0n : reserve - input.nativeBalance;
  return {
    nativeBalance: input.nativeBalance,
    reserve,
    shortfall,
    estimatedGasUnits: input.estimatedGasUnits,
    maxFeePerGas: input.maxFeePerGas,
    safetyMultiplier: safety,
  };
}

export function usableNative(info: GasReserveInfo): bigint {
  const usable = info.nativeBalance - info.reserve;
  return usable > 0n ? usable : 0n;
}
