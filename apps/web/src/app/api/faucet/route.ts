import { NextResponse } from "next/server";
import { claimDrip, faucetStatus } from "@/lib/server/faucet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await faucetStatus();
  return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
}

/** First hop of x-forwarded-for is the client on Vercel; x-real-ip as fallback. */
function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || undefined;
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
