import { formatUnits, parseUnits } from "viem";

export const BPS = 10_000n;

/** amount * (10000 - bps) / 10000 */
export function applyBps(amount: bigint, bps: number): bigint {
  const b = BigInt(Math.max(0, Math.min(10_000, Math.round(bps))));
  return (amount * (BPS - b)) / BPS;
}

/** amount * bps / 10000 */
export function bpsOf(amount: bigint, bps: number): bigint {
  const b = BigInt(Math.max(0, Math.round(bps)));
  return (amount * b) / BPS;
}

/** Multiply a bigint by a float factor with 6 fractional digits of precision. */
export function mulFloat(amount: bigint, factor: number): bigint {
  const scaled = BigInt(Math.round(factor * 1_000_000));
  return (amount * scaled) / 1_000_000n;
}

/** Convert an amount between decimal scales. Floors when reducing precision. */
export function scaleDecimals(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return amount;
  if (fromDecimals > toDecimals) {
    return amount / 10n ** BigInt(fromDecimals - toDecimals);
  }
  return amount * 10n ** BigInt(toDecimals - fromDecimals);
}

export function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function ratio(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  // 1e9 precision is plenty for scoring.
  return Number((numerator * 1_000_000_000n) / denominator) / 1_000_000_000;
}

export interface FormatOptions {
  /** Maximum digits after the decimal point. */
  maxFractionDigits?: number;
  /** Minimum significant digits to keep for small values. */
  minSignificant?: number;
  /** Group thousands with a thin space. */
  grouping?: boolean;
}

/**
 * Human readable amount. Keeps significant digits for tiny testnet balances
 * (0.00000312 ETH) while trimming noise on large ones (14.2 MON).
 */
export function formatAmount(raw: bigint, decimals: number, opts: FormatOptions = {}): string {
  const { maxFractionDigits = 6, minSignificant = 3, grouping = true } = opts;
  if (raw === 0n) return "0";
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const full = formatUnits(abs, decimals);
  const [intPartRaw = "0", fracRaw = ""] = full.split(".");
  let frac = fracRaw;

  if (intPartRaw === "0") {
    // keep leading zeros + minSignificant digits, but never more than the asset has
    const leadingZeros = frac.match(/^0*/)?.[0].length ?? 0;
    const keep = Math.min(frac.length, Math.max(maxFractionDigits, leadingZeros + minSignificant));
    frac = frac.slice(0, keep);
  } else {
    frac = frac.slice(0, maxFractionDigits);
  }
  frac = frac.replace(/0+$/, "");

  let intPart = intPartRaw;
  if (grouping && intPart.length > 3) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  const out = frac.length > 0 ? `${intPart}.${frac}` : intPart;
  if (out === "0" && abs > 0n) return negative ? "-<0.000001" : "<0.000001";
  return negative ? `-${out}` : out;
}

export function parseAmount(value: string, decimals: number): bigint {
  const cleaned = value.replace(/[\s,_]/g, "");
  if (!cleaned || cleaned === ".") return 0n;
  return parseUnits(cleaned, decimals);
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string): string {
  return shortAddress(hash, 6);
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}
