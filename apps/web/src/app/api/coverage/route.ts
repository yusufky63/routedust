import { NextResponse } from "next/server";
import { fetchCoverage, type CoverageReport } from "@testnet-router/providers";

export const revalidate = 900;

let cached: { report: CoverageReport; at: number } | undefined;
const TTL_MS = 15 * 60_000;

/** Aggregates public chain-support registries server-side (some feeds send no CORS headers, some are ~1 MB). */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.report, { headers: { "x-cache": "hit" } });
  }
  const report = await fetchCoverage(fetch, { timeoutMs: 30_000 });
  cached = { report, at: Date.now() };
  return NextResponse.json(report, { headers: { "x-cache": "miss", "cache-control": "public, max-age=300" } });
}
