import { CHAINS } from "@testnet-router/registry";
import { SITE_URL } from "@/lib/page-meta";

export const dynamic = "force-static";

const PAGES: [path: string, label: string, what: string][] = [
  ["/", "Router", "scan a wallet and gather its balances into one chain and asset"],
  ["/swap/bridge", "Bridge", "send one asset to another testnet through a live bridge"],
  ["/bridges", "Bridges", "each testnet's own bridge site, checked against its docs"],
  ["/faucets", "Faucets", "where to get testnet gas, easiest first"],
  ["/networks", "Networks", "supported testnets, chain IDs, gas assets and RPC health"],
  ["/protocols", "Protocols", "providers and the routes they confirmed live"],
  ["/docs", "Docs", "what the app does, in plain words"],
  ["/how-it-works", "How it works", "scan, discover, quote, simulate, sign"],
  ["/status", "Status", "live checks of the RPCs and APIs the app depends on"],
];

const APIS: [path: string, what: string][] = [
  [
    "/api/discovery",
    "GET, JSON. The live capability graph shared by every visitor, refreshed at most every 5 minutes: `edges` (every swap, bridge and wrap edge confirmed live, with provider, from/to chain and asset, and its source), `summaries` (per provider: edge count, chains, ok or error), `discoveredAt`, `cachedAt`, `ttlMs`. Bigints are sent as {\"__bigint__\": \"<decimal>\"}.",
  ],
  [
    "/api/coverage",
    "GET, JSON. Which testnets each provider supports, aggregated from public registries (chainid.network, Circle, Uniswap, Across, LI.FI, LayerZero, Hyperlane): `sources` (per registry: ok, entry count), `chains` (per chain id: name, providers, whether RouteDust supports it), `generatedAt`. Cached for 15 minutes.",
  ],
  [
    "/api/feeds/uniswap",
    "GET, JSON. The Uniswap deployments feed trimmed to the contracts RouteDust uses (v2/v3/v4 factories, quoters, routers, Permit2) per chain: `version`, `generatedAt`, `source`, `records`.",
  ],
  [
    "/api/health",
    "GET, JSON. `status` (ok, degraded or down), `checkedAt`, `services` (Circle attestation and Gateway APIs, LI.FI, Across, Hyperlane explorer) and `chains` (each testnet's primary RPC), each with ok or down. Cached for 60 seconds.",
  ],
];

/** Plain-text summary for language models (llmstxt.org): what the product is and where things are. */
export function GET() {
  const body = [
    "# RouteDust — testnet router",
    "",
    `> RouteDust (${SITE_URL}) gathers testnet balances scattered across ${CHAINS.length} EVM testnets into the one chain and asset you pick. It reads a wallet's balances from each network in the browser, finds the swap and bridge routes that work right now (Circle CCTP and Gateway, Uniswap v2/v3/v4, Across, Hyperlane, Stargate, LI.FI, OP Standard Bridge, wrapping), keeps enough gas on every chain to pay for the moves, quotes and simulates each transaction, and leaves every signature to the user's own wallet. Routes come only from live quotes and on-chain checks, never from what a protocol claims to support. It also lists each testnet's faucets and official bridge sites.`,
    "",
    "## Pages",
    "",
    ...PAGES.map(([path, label, what]) => `- [${label}](${SITE_URL}${path === "/" ? "" : path}): ${what}`),
    "",
    "## Public JSON endpoints",
    "",
    ...APIS.map(([path, what]) => `- ${SITE_URL}${path}: ${what}`),
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
