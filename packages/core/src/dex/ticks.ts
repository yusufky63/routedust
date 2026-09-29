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

/** TickMath.getSqrtRatioAtTick, bit for bit (Uniswap v3 core). */
export function sqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new Error(`tick ${tick} out of range`);
  const abs = BigInt(Math.abs(tick));
  const steps: [bigint, bigint][] = [
    [0x2n, 0xfff97272373d413259a46990580e213an],
    [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  let ratio = (abs & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  for (const [bit, factor] of steps) if ((abs & bit) !== 0n) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function ordered(a: bigint, b: bigint): [bigint, bigint] {
  return a > b ? [b, a] : [a, b];
}

/** LiquidityAmounts.getLiquidityForAmounts (Uniswap v3 periphery). */
export function liquidityForAmounts(sqrtPriceX96: bigint, sqrtA: bigint, sqrtB: bigint, amount0: bigint, amount1: bigint): bigint {
  const [a, b] = ordered(sqrtA, sqrtB);
  const forAmount0 = (lo: bigint, hi: bigint) => (amount0 * ((lo * hi) / Q96)) / (hi - lo);
  const forAmount1 = (lo: bigint, hi: bigint) => (amount1 * Q96) / (hi - lo);
  if (sqrtPriceX96 <= a) return forAmount0(a, b);
  if (sqrtPriceX96 < b) {
    const l0 = forAmount0(sqrtPriceX96, b);
    const l1 = forAmount1(a, sqrtPriceX96);
    return l0 < l1 ? l0 : l1;
  }
  return forAmount1(a, b);
}

/** LiquidityAmounts.getAmountsForLiquidity (rounded down). */
export function amountsForLiquidity(sqrtPriceX96: bigint, sqrtA: bigint, sqrtB: bigint, liquidity: bigint): { amount0: bigint; amount1: bigint } {
  const [a, b] = ordered(sqrtA, sqrtB);
  const amount0 = (lo: bigint, hi: bigint) => ((liquidity << 96n) * (hi - lo)) / hi / lo;
  const amount1 = (lo: bigint, hi: bigint) => (liquidity * (hi - lo)) / Q96;
  if (sqrtPriceX96 <= a) return { amount0: amount0(a, b), amount1: 0n };
  if (sqrtPriceX96 < b) return { amount0: amount0(sqrtPriceX96, b), amount1: amount1(a, sqrtPriceX96) };
  return { amount0: 0n, amount1: amount1(a, b) };
}

/**
 * What a v3 mint actually takes from `desired` amounts at the pool's current
 * price: the scarcer side sets the liquidity, the other side is used only in
 * proportion. Minimums for the mint are derived from these, not from the
 * desired amounts (which one side never fully reaches).
 */
export function mintAmounts(sqrtPriceX96: bigint, tickLower: number, tickUpper: number, amount0Desired: bigint, amount1Desired: bigint): { amount0: bigint; amount1: bigint } {
  const a = sqrtRatioAtTick(tickLower);
  const b = sqrtRatioAtTick(tickUpper);
  return amountsForLiquidity(sqrtPriceX96, a, b, liquidityForAmounts(sqrtPriceX96, a, b, amount0Desired, amount1Desired));
}
