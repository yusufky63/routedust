import { NextResponse } from "next/server";
import { LIFI_API_BASE, lifiFetch } from "@testnet-router/providers";

export const dynamic = "force-dynamic";

/** Only the read endpoints the adapter uses; nothing else is forwarded. */
const ALLOWED = new Set(["tools", "quote", "status", "chains", "connections"]);

/**
 * Same-origin proxy for li.quest so the API key and integrator fee settings
 * stay on the server. The browser calls /api/lifi/<endpoint>?<query>.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Exactly one allowed segment: /api/lifi/quote/anything must not reach other LI.FI endpoints with our key.
  const endpoint = path.length === 1 ? (path[0] ?? "") : "";
  if (!ALLOWED.has(endpoint)) return NextResponse.json({ error: "endpoint not allowed" }, { status: 404 });
  const incoming = new URL(request.url);
  const url = new URL(`${LIFI_API_BASE}/${endpoint}`);
  incoming.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  try {
    const res = await lifiFetch(fetch, url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
