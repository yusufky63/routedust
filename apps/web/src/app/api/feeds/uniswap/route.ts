import { NextResponse } from "next/server";
import { UNISWAP_DEPLOYMENTS_FEED_URL } from "@testnet-router/providers";

export const revalidate = 900;

const KEEP = new Set([
  "v3:UniswapV3Factory",
  "v3:QuoterV2",
  "v3:SwapRouter02",
  "universal-router:UniversalRouter",
  "permit2:Permit2",
  "v4:PoolManager",
  "v4:V4Quoter",
  "v4:StateView",
  "v2:UniswapV2Factory",
  "v2:UniswapV2Router02",
  "v3:NonfungiblePositionManager",
]);

/** Same-origin proxy for the Uniswap deployments feed (the origin sends no CORS headers). Trimmed to the contracts we use. */
export async function GET() {
  try {
    const res = await fetch(UNISWAP_DEPLOYMENTS_FEED_URL, { next: { revalidate: 900 } });
    if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
    const payload = (await res.json()) as { version?: string; generatedAt?: string; records?: { protocol?: string; contract?: string }[] };
    const records = (payload.records ?? []).filter((r) => KEEP.has(`${r.protocol ?? ""}:${r.contract ?? ""}`));
    return NextResponse.json(
      { version: payload.version, generatedAt: payload.generatedAt, source: UNISWAP_DEPLOYMENTS_FEED_URL, records },
      // Short browser cache: the server-side data cache already keeps upstream traffic low.
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=900" } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
