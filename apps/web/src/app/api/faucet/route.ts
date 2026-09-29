import { NextResponse } from "next/server";
import { claimDrip, faucetStatus } from "@/lib/server/faucet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await faucetStatus();
  return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
}

/**
 * The client address the per-IP limit is keyed on. On Vercel the platform
 * writes these headers itself. Anywhere else a client can send its own
 * x-forwarded-for, so only the entries appended by our own proxies are
 * believed: FAUCET_TRUSTED_PROXY_HOPS (default 1) counts them from the right.
 */
function clientIp(request: Request): string | undefined {
  const header = (name: string) => request.headers.get(name)?.trim() || undefined;
  if (process.env.VERCEL) return header("x-vercel-forwarded-for")?.split(",")[0]?.trim() || header("x-forwarded-for")?.split(",")[0]?.trim() || header("x-real-ip");
  const hops = Math.max(0, Math.floor(Number(process.env.FAUCET_TRUSTED_PROXY_HOPS ?? 1)) || 0);
  const chain = (header("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (hops > 0 && chain.length >= hops) return chain[chain.length - hops];
  return hops === 0 ? undefined : header("x-real-ip");
}

export async function POST(request: Request) {
  // Claims come from this site's own page only.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Cross-site requests are not accepted" }, { status: 403 });
  }
  let body: { address?: unknown; chainId?: unknown; captchaToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await claimDrip({
    address: typeof body.address === "string" ? body.address.trim() : "",
    chainId: Number(body.chainId),
    captchaToken: typeof body.captchaToken === "string" ? body.captchaToken : "",
    ip: clientIp(request),
  });
  if (result.ok) return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (result.retryAfterSeconds && result.retryAfterSeconds > 0) headers["retry-after"] = String(result.retryAfterSeconds);
  return NextResponse.json({ error: result.error, retryAfterSeconds: result.retryAfterSeconds }, { status: result.status, headers });
}
