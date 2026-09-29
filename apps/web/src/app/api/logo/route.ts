import { NextResponse } from "next/server";

export const revalidate = 86400;

/**
 * Only these upstreams may be proxied; nothing else is fetched. The git ref is
 * part of the prefix on purpose: GitHub serves commits from forks under the
 * parent repository's raw URL, so an open ref would let anyone's fork supply
 * the file.
 */
const ALLOWED: { host: string; prefix: string }[] = [
  { host: "raw.githubusercontent.com", prefix: "/lifinance/types/main/src/assets/icons/" },
  { host: "raw.githubusercontent.com", prefix: "/trustwallet/assets/master/blockchains/" },
  { host: "static.debank.com", prefix: "/image/" },
];

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Served from our own origin, so the response must never be able to run as a
 * document: an SVG opened directly would otherwise execute its scripts with
 * the app's localStorage and wallet connection. `sandbox` plus `default-src
 * 'none'` keeps it an inert image (styles inside SVGs still apply in <img>).
 */
const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
};

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
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.pathname.includes("..") ||
    !ALLOWED.some((a) => a.host === target.hostname && target.pathname.startsWith(a.prefix))
  ) {
    return new NextResponse("host not allowed", { status: 403 });
  }
  const ext = target.pathname.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return new NextResponse("not an image", { status: 415 });
  try {
    // No redirects: an allowed path must not bounce the fetch somewhere else.
    const upstream = await fetch(target.toString(), { redirect: "error", next: { revalidate: 86400 } });
    if (!upstream.ok) return new NextResponse("upstream error", { status: 502 });
    const body = await upstream.arrayBuffer();
    if (body.byteLength > 512 * 1024) return new NextResponse("too large", { status: 413 });
    return new NextResponse(body, {
      headers: { "content-type": type, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", ...SECURITY_HEADERS },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
