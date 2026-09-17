"use client";

import { useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { displayPrice } from "@testnet-router/core";
import { getClients } from "@/lib/router";
import { useRouterStore } from "@/lib/store";

const swapEvent = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)");

interface Point {
  block: bigint;
  price: number;
}

/**
 * Recent pool price from the v3 pool's own Swap events (last ~5000 blocks,
 * read in 1000-block chunks so public RPCs accept the range). Testnet pools
 * are thin: the line is context, not a chart to trade on.
 */
export function PriceHistory({ chainId, pool, decimals0, decimals1, invert, label }: { chainId: number; pool: Address; decimals0: number; decimals1: number; invert: boolean; label: string }) {
  const rpcOverrides = useRouterStore((s) => s.settings.rpcOverrides);
  const [points, setPoints] = useState<Point[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(undefined);
    setError(undefined);
    setLoading(true);
    (async () => {
      try {
        const client = getClients(rpcOverrides).get(chainId);
        const head = await client.getBlockNumber();
        const out: Point[] = [];
        for (let i = 0; i < 5; i += 1) {
          const to = head - BigInt(i) * 1000n;
          const from = to - 999n;
          if (from < 0n) break;
          const logs = await client.getLogs({ address: pool, event: swapEvent, fromBlock: from, toBlock: to });
          for (const log of logs) {
            if (log.args.sqrtPriceX96 === undefined) continue;
            const p = displayPrice(log.args.sqrtPriceX96, decimals0, decimals1);
            out.push({ block: log.blockNumber, price: invert ? 1 / p : p });
          }
        }
        out.sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
        if (!cancelled) setPoints(out);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message.split("\n")[0]?.slice(0, 100) : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, pool, decimals0, decimals1, invert, rpcOverrides]);

  if (loading) return <span className="mono text-[11px] text-muted">reading recent swaps…</span>;
  if (error) return <span className="mono text-[11px] text-muted">price history unavailable ({error})</span>;
  if (!points || points.length < 2) return <span className="mono text-[11px] text-muted">fewer than two swaps in the last 5000 blocks</span>;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const w = 320;
  const h = 56;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (p: number) => (max === min ? h / 2 : h - ((p - min) / (max - min)) * (h - 6) - 3);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const first = prices[0] ?? 0;
  const last = prices[prices.length - 1] ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const fmt = (v: number) => (v >= 1000 ? v.toFixed(0) : v >= 1 ? v.toFixed(4) : v.toPrecision(4));

  return (
    <div className="flex flex-col gap-1">
      <div className="mono flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted">
        <span className="text-text">{label}</span>
        <span>last {fmt(last)}</span>
        <span className={change >= 0 ? "text-success" : "text-error"}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
        <span>
          range {fmt(min)} – {fmt(max)} · {points.length} swaps · last 5000 blocks
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full max-w-md" role="img" aria-label={`${label} recent price`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-accent" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
