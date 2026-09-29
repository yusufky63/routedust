import { NextResponse } from "next/server";
import { fetchCoverage, type CoverageReport } from "@testnet-router/providers";

export const revalidate = 900;

const TTL_MS = 15 * 60_000;
/** `?refresh=1` is honoured at most this often: the report pulls several large public registries. */
const MIN_REFRESH_MS = 60_000;

let cached: { report: CoverageReport; at: number } | undefined;
let inflight: Promise<CoverageReport> | undefined;

function load(): Promise<CoverageReport> {
  inflight ??= fetchCoverage(fetch, { timeoutMs: 30_000 })
    .then((report) => {
      cached = { report, at: Date.now() };
      return report;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

/** Aggregates public chain-support registries server-side (some feeds send no CORS headers, some are ~1 MB). */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < TTL_MS && !(force && age > MIN_REFRESH_MS)) {
    return NextResponse.json(cached.report, { headers: { "x-cache": "hit" } });
  }
  try {
    const report = await load();
    return NextResponse.json(report, { headers: { "x-cache": "miss", "cache-control": "public, max-age=300" } });
  } catch (err) {
    // A failed refresh keeps serving the last good report.
    if (cached) return NextResponse.json(cached.report, { headers: { "x-cache": "stale" } });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
