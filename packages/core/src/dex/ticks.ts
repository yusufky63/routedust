/**
 * Uniswap v3 tick / sqrtPrice helpers for pool creation and price display.
 * All prices are token1 per token0 in raw units (as the pool sees them).
 */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
const Q96 = 1n << 96n;

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** sqrtPriceX96 for a pool where `amount1` raw units of token1 buy `amount0` raw units of token0. */
export function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) throw new Error("amounts must be positive");
  return isqrt((amount1 << 192n) / amount0);
}

/** Price (token1 per token0, raw units) as a float from sqrtPriceX96. */
export function priceFromSqrtPriceX96(sqrtPriceX96: bigint): number {
  const s = Number(sqrtPriceX96) / Number(Q96);
  return s * s;
}

/** Human price: token1 per token0 adjusted for decimals. */
export function displayPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  return priceFromSqrtPriceX96(sqrtPriceX96) * 10 ** (decimals0 - decimals1);
}

export function tickFromPrice(priceRaw: number): number {
  return Math.floor(Math.log(priceRaw) / Math.log(1.0001));
}

export function tickFromSqrtPriceX96(sqrtPriceX96: bigint): number {
  return tickFromPrice(priceFromSqrtPriceX96(sqrtPriceX96));
}

export function nearestUsableTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  if (rounded < MIN_TICK) return rounded + tickSpacing;
  if (rounded > MAX_TICK) return rounded - tickSpacing;
  return rounded;
}

export const TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 };

/** Full-range bounds aligned to the fee tier's spacing. */
export function fullRange(fee: number): { tickLower: number; tickUpper: number } {
  const spacing = TICK_SPACING[fee] ?? 60;
  return { tickLower: Math.ceil(MIN_TICK / spacing) * spacing, tickUpper: Math.floor(MAX_TICK / spacing) * spacing };
}

/** Symmetric range of ±pct around the current price, aligned to spacing. */
export function rangeAround(sqrtPriceX96: bigint, fee: number, pct: number): { tickLower: number; tickUpper: number } {
  const spacing = TICK_SPACING[fee] ?? 60;
  const price = priceFromSqrtPriceX96(sqrtPriceX96);
  const lower = nearestUsableTick(tickFromPrice(price * (1 - pct / 100)), spacing);
  const upper = nearestUsableTick(tickFromPrice(price * (1 + pct / 100)), spacing);
  return { tickLower: Math.min(lower, upper - spacing), tickUpper: Math.max(upper, lower + spacing) };
}
