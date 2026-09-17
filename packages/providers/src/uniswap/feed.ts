import type { Address } from "@testnet-router/core";

/** Official unified deployments feed (no CORS: the web app proxies it). */
export const UNISWAP_DEPLOYMENTS_FEED_URL = "https://developers.uniswap.org/deployments.json";

export interface UniswapFeedDeployment {
  chainId: number;
  chainName: string;
  tier?: string;
  factory?: Address;
  quoterV2?: Address;
  swapRouter02?: Address;
  universalRouter?: Address;
  permit2?: Address;
  v4PoolManager?: Address;
  v4Quoter?: Address;
  v4StateView?: Address;
  v2Factory?: Address;
  v2Router?: Address;
  positionManager?: Address;
}

interface FeedRecord {
  protocol?: string;
  contract?: string;
  chain?: string;
  chainId?: number | string;
  address?: string;
  tier?: string;
  status?: string;
}

const isAddress = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

/**
 * Normalises the Uniswap feed ({ version, generatedAt, records[] }) into one
 * entry per chain with the contracts the swap adapter needs.
 */
export function parseUniswapFeed(payload: unknown): { generatedAt?: string; deployments: Map<number, UniswapFeedDeployment> } {
  const deployments = new Map<number, UniswapFeedDeployment>();
  if (!payload || typeof payload !== "object") return { deployments };
  const root = payload as { generatedAt?: string; records?: unknown };
  const records: FeedRecord[] = Array.isArray(root.records)
    ? (root.records as FeedRecord[])
    : root.records && typeof root.records === "object"
      ? (Object.values(root.records as Record<string, FeedRecord>) as FeedRecord[])
      : [];

  for (const r of records) {
    const chainId = Number(r.chainId);
    if (!Number.isFinite(chainId) || chainId <= 0 || !isAddress(r.address)) continue;
    if (r.status && /deprecated|retired/i.test(r.status)) continue;
    const entry = deployments.get(chainId) ?? { chainId, chainName: r.chain ?? String(chainId), tier: r.tier };
    const key = `${r.protocol ?? ""}:${r.contract ?? ""}`;
    switch (key) {
      case "v3:UniswapV3Factory":
        entry.factory = r.address;
        break;
      case "v3:QuoterV2":
        entry.quoterV2 = r.address;
        break;
      case "v3:SwapRouter02":
        entry.swapRouter02 = r.address;
        break;
      case "universal-router:UniversalRouter":
        entry.universalRouter = r.address;
        break;
      case "permit2:Permit2":
        entry.permit2 = r.address;
        break;
      case "v4:PoolManager":
        entry.v4PoolManager = r.address;
        break;
      case "v4:V4Quoter":
        entry.v4Quoter = r.address;
        break;
      case "v4:StateView":
        entry.v4StateView = r.address;
        break;
      case "v2:UniswapV2Factory":
        entry.v2Factory = r.address;
        break;
      case "v2:UniswapV2Router02":
        entry.v2Router = r.address;
        break;
      case "v3:NonfungiblePositionManager":
        entry.positionManager = r.address;
        break;
      default:
        break;
    }
    deployments.set(chainId, entry);
  }
  return { generatedAt: root.generatedAt, deployments };
}

export function hasV3Swap(d: UniswapFeedDeployment | undefined): d is UniswapFeedDeployment & Required<Pick<UniswapFeedDeployment, "factory" | "quoterV2" | "swapRouter02">> {
  return Boolean(d?.factory && d.quoterV2 && d.swapRouter02);
}
