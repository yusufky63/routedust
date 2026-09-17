import { NextResponse } from "next/server";
import { LIFI_API_BASE, applyLifiIntegration, lifiIntegrationFromEnv } from "@testnet-router/providers";

export const dynamic = "force-dynamic";

/** Only the read endpoints the adapter uses; nothing else is forwarded. */
const ALLOWED = new Set(["tools", "quote", "status", "chains", "connections"]);

/**
 * Same-origin proxy for li.quest so the API key and integrator fee settings
 * stay on the server. The browser calls /api/lifi/<endpoint>?<query>.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!ALLOWED.has(path[0] ?? "")) return NextResponse.json({ error: "endpoint not allowed" }, { status: 404 });
  const incoming = new URL(request.url);
  const url = new URL(`${LIFI_API_BASE}/${endpoint}`);
  incoming.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  const headers = new Headers({ accept: "application/json" });
  applyLifiIntegration(url, headers, lifiIntegrationFromEnv());
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
