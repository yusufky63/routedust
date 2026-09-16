import { NextResponse } from "next/server";

export const revalidate = 86400;

/** Only these upstreams may be proxied; nothing else is fetched. */
const ALLOWED: { host: string; prefix: string }[] = [
  { host: "raw.githubusercontent.com", prefix: "/lifinance/types/" },
  { host: "raw.githubusercontent.com", prefix: "/trustwallet/assets/" },
  { host: "static.debank.com", prefix: "/image/" },
];

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Same-origin logo proxy: GitHub serves SVGs as text/plain (browsers refuse
 * them in <img>) and some sandboxes block third-party images. Cached a day.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.some((a) => a.host === target.hostname && target.pathname.startsWith(a.prefix))) {
    return new NextResponse("host not allowed", { status: 403 });
  }
  try {
    const upstream = await fetch(target.toString(), { next: { revalidate: 86400 } });
    if (!upstream.ok) return new NextResponse("upstream error", { status: 502 });
    const ext = target.pathname.split(".").pop()?.toLowerCase() ?? "";
    const type = TYPES[ext] ?? upstream.headers.get("content-type") ?? "application/octet-stream";
    const body = await upstream.arrayBuffer();
    if (body.byteLength > 512 * 1024) return new NextResponse("too large", { status: 413 });
    return new NextResponse(body, {
      headers: { "content-type": type, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-content-type-options": "nosniff" },
    });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "fetch failed", { status: 502 });
  }
}
