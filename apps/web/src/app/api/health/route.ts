import { NextResponse } from "next/server";
import { getHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";

/** Live state of every RPC and API the app depends on: names and ok/down only. */
export async function GET() {
  const report = await getHealth();
  return NextResponse.json(report, { headers: { "cache-control": "public, s-maxage=60" } });
}
