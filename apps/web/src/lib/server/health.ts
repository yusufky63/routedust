import "server-only";
import { ACROSS_TESTNET, CCTP_V2_TESTNET, CHAIN_IDS, CHAINS, CIRCLE_GATEWAY_TESTNET } from "@testnet-router/registry";
import { HYPERLANE_EXPLORER_API, LIFI_API_BASE, lifiFetch } from "@testnet-router/providers";

export type CheckStatus = "ok" | "down";

/** Public shape: names and states only, never URLs, keys or upstream error bodies. */
export interface HealthReport {
  status: "ok" | "degraded" | "down";
  checkedAt: number;
  services: { id: string; name: string; status: CheckStatus }[];
  chains: { chainId: number; name: string; status: CheckStatus }[];
}

const TIMEOUT_MS = 4_000;
export const HEALTH_TTL_MS = 60_000;

type Accept = (body: unknown) => boolean;

/** True when the endpoint answers 2xx with JSON the caller accepts, within the timeout. */
async function answers(request: () => Promise<Response>, accept: Accept = () => true): Promise<boolean> {
  try {
    const res = await request();
    if (!res.ok) return false;
    return accept(await res.json());
  } catch {
    return false;
  }
}

function get(url: string): () => Promise<Response> {
  return () => fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function post(url: string, body: unknown): () => Promise<Response> {
  return () => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const isObject = (b: unknown): b is Record<string, unknown> => typeof b === "object" && b !== null;

/** The same base URLs the provider adapters call, each with the cheapest request that proves the service answers. */
const SERVICES: { id: string; name: string; role: string; check: () => Promise<boolean> }[] = [
  {
    id: "circle-iris",
    name: "Circle attestation API",
    role: "Signs off Circle CCTP USDC burns so they can be minted on the other chain.",
    // Ethereum Sepolia (domain 0) → Base Sepolia (domain 6) fee table.
    check: () => answers(get(`${CCTP_V2_TESTNET.irisApiBase}/v2/burn/USDC/fees/0/6`), Array.isArray),
  },
  {
    id: "circle-gateway",
    name: "Circle Gateway API",
    role: "Pooled USDC balances and one-signature transfers from several chains.",
    check: () => answers(get(`${CIRCLE_GATEWAY_TESTNET.apiBase}/v1/info`), (b) => isObject(b) && Array.isArray(b.domains)),
  },
  {
    id: "lifi",
    name: "LI.FI",
    role: "Cross-chain quotes from the LI.FI aggregator.",
    check: () =>
      answers(
        () => lifiFetch(globalThis.fetch.bind(globalThis), new URL(`${LIFI_API_BASE}/chains?chainTypes=EVM`), { signal: AbortSignal.timeout(TIMEOUT_MS) }),
        (b) => isObject(b) && Array.isArray(b.chains),
      ),
  },
  {
    id: "across",
    name: "Across",
    role: "Bridge quotes and deposit tracking from Across relayers.",
    check: () =>
      answers(get(`${ACROSS_TESTNET.apiBase}/available-routes?originChainId=${CHAIN_IDS.ETHEREUM_SEPOLIA}&destinationChainId=${CHAIN_IDS.BASE_SEPOLIA}`), Array.isArray),
  },
  {
    id: "hyperlane",
    name: "Hyperlane explorer",
    role: "Confirms delivery of Hyperlane USDC transfers on the destination chain.",
    check: () => answers(post(HYPERLANE_EXPLORER_API, { query: "{ __typename }" }), (b) => isObject(b) && isObject(b.data)),
  },
];

/** Plain-language role of each checked service, for the status page. */
export const SERVICE_ROLES: Record<string, string> = Object.fromEntries(SERVICES.map((s) => [s.id, s.role]));

/** eth_chainId on the chain's primary RPC; an endpoint serving another chain counts as down. */
function checkRpc(url: string | undefined, chainId: number): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  return answers(post(url, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), (b) => {
    const result = isObject(b) ? b.result : undefined;
    return typeof result === "string" && Number.parseInt(result, 16) === chainId;
  });
}

const state = (ok: boolean): CheckStatus => (ok ? "ok" : "down");

async function runChecks(): Promise<HealthReport> {
  const [services, chains] = await Promise.all([
    Promise.all(SERVICES.map(async (s) => ({ id: s.id, name: s.name, status: state(await s.check()) }))),
    Promise.all(CHAINS.map(async (c) => ({ chainId: c.id, name: c.name, status: state(await checkRpc(c.rpcUrls[0], c.id)) }))),
  ]);
  const chainsDown = chains.filter((c) => c.status === "down").length;
  const servicesDown = services.filter((s) => s.status === "down").length;
  const status = chainsDown > chains.length / 2 ? "down" : chainsDown + servicesDown > 0 ? "degraded" : "ok";
  return { status, checkedAt: Date.now(), services, chains };
}

let cached: { report: HealthReport; at: number } | undefined;
let inflight: Promise<HealthReport> | undefined;

/** One check run per server per minute, shared by the API route and the status page; a run in flight is shared. */
export function getHealth(): Promise<HealthReport> {
  if (cached && Date.now() - cached.at < HEALTH_TTL_MS) return Promise.resolve(cached.report);
  inflight ??= runChecks()
    .then((report) => {
      cached = { report, at: Date.now() };
      return report;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}
