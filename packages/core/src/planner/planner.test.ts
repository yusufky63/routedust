import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { CapabilityGraph, nodeFromAsset } from "../graph/multigraph";
import type {
  Asset,
  CapabilityEdge,
  ChainConfig,
  ClientResolver,
  RouteEdge,
  RouteProvider,
  WalletScan,
} from "../types";
import { planConsolidation, rescorePlan } from "./planner";

const SEP = 11155111;
const BASE = 84532;
const MONAD = 10143;
const at = "2026-09-16T00:00:00Z";

function chain(id: number, name: string, symbol: string): ChainConfig {
  return {
    id,
    key: name.toLowerCase(),
    name,
    shortName: name,
    testnet: true,
    vm: "EVM",
    tier: 1,
    nativeAsset: { canonicalAssetId: symbol, symbol, name: symbol, decimals: 18 },
    rpcUrls: ["http://localhost"],
    explorerUrl: "http://explorer",
    faucets: [
      { id: `${name}-faucet`, chainId: id, assetId: symbol, name: `${name} faucet`, url: "https://faucet", source: "CHAIN_OFFICIAL", lastVerifiedAt: at },
    ],
    source: { kind: "manual", url: "t", lastVerifiedAt: at },
  };
}

function native(chainId: number, symbol: string): Asset {
  return {
    id: `${chainId}:native`,
    chainId,
    canonicalAssetId: symbol,
    kind: "NATIVE",
    decimals: 18,
    symbol,
    name: symbol,
    representation: "NATIVE",
    verified: true,
  };
}

function usdc(chainId: number): Asset {
  return {
    id: `${chainId}:0xusdc`,
    chainId,
    canonicalAssetId: "USDC",
    kind: "ERC20",
    address: "0x0000000000000000000000000000000000000001",
    decimals: 6,
    symbol: "USDC",
    name: "USDC",
    representation: "CIRCLE_NATIVE",
    verified: true,
  };
}

const chains = [chain(SEP, "Sepolia", "ETH"), chain(BASE, "Base", "ETH"), chain(MONAD, "Monad", "MON")];
const assets = [native(SEP, "ETH"), usdc(SEP), native(BASE, "ETH"), usdc(BASE), native(MONAD, "MON"), usdc(MONAD)];
const byId = new Map(assets.map((a) => [a.id, a]));

function edge(provider: string, type: CapabilityEdge["type"], from: Asset, to: Asset, extra: Partial<CapabilityEdge> = {}): CapabilityEdge {
  return {
    id: `${provider}:${type}:${from.id}>${to.id}`,
    provider,
    type,
    from: nodeFromAsset(from),
    to: nodeFromAsset(to),
    crossChain: from.chainId !== to.chainId,
    requiresApproval: from.kind !== "NATIVE",
    requiresSourceGas: true,
    requiresDestinationGas: false,
    outputCanonicality: "CANONICAL",
    reliabilityClass: "CANONICAL",
    baselineGasUnits: 200_000n,
    baselineSeconds: 60,
    source: { kind: "manual", url: "t", lastVerifiedAt: at },
    ...extra,
  };
}

/** Fake DEX: 1 ETH -> 3000 USDC. Fake bridge: 1:1 minus 0.1%. */
function makeProvider(key: string, rate: (amountIn: bigint, edge: CapabilityEdge) => bigint | null): RouteProvider {
  return {
    key,
    name: key,
    source: { kind: "manual", url: "t", lastVerifiedAt: at },
    async discover() {
      return [];
    },
    async quote(req) {
      const out = rate(req.amountIn, req.edge);
      if (out === null) return null;
      const quoted: RouteEdge = {
        ...req.edge,
        health: "QUOTED",
        quote: {
          provider: key,
          amountIn: req.amountIn,
          amountOut: out,
          minAmountOut: (out * 99n) / 100n,
          feeOut: 0n,
          estimatedGasUnits: 150_000n,
          estimatedSeconds: 60,
          txCount: 1,
          quotedAt: req.now,
          expiresAt: req.now + 60_000,
        },
      };
      return quoted;
    },
    async build() {
      return [];
    },
    async status() {
      return { kind: "COMPLETED" };
    },
  };
}

const dex = makeProvider("dex", (amountIn, e) => {
  const from = byId.get(e.from.assetId);
  // Only ETH pools are "live"; MON has a structural edge but no liquidity.
  if (from?.kind === "NATIVE" && from.canonicalAssetId === "ETH") return (amountIn * 3000n) / 10n ** 12n; // 3000 USDC/ETH
  return null;
});
const bridge = makeProvider("bridge", (amountIn) => (amountIn * 999n) / 1000n);

const fakeClient = {
  estimateFeesPerGas: async () => ({ maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
  getGasPrice: async () => 1_000_000_000n,
} as unknown as PublicClient;

const clients: ClientResolver = {
  get: () => fakeClient,
  chain: (id) => chains.find((c) => c.id === id) as ChainConfig,
};

function scan(balances: Record<string, bigint>): WalletScan {
  const now = Date.now();
  return {
    wallet: "0x00000000000000000000000000000000000000aa",
    scannedAt: now,
    chains: chains.map((c) => ({
      chainId: c.id,
      ok: true,
      balances: assets
        .filter((a) => a.chainId === c.id)
        .map((a) => ({ asset: a, raw: balances[a.id] ?? 0n, formatted: "", fetchedAt: now })),
    })),
  };
}

const graph = new CapabilityGraph([
  edge("dex", "SWAP", native(SEP, "ETH"), usdc(SEP), { reliabilityClass: "LIQUIDITY" }),
  edge("bridge", "CCTP", usdc(SEP), usdc(BASE), { reliabilityClass: "ISSUER" }),
  edge("bridge", "CCTP", usdc(MONAD), usdc(BASE), { reliabilityClass: "ISSUER" }),
  // MON has a structural swap edge but the fake DEX returns no quote for it.
  edge("dex", "SWAP", native(MONAD, "MON"), usdc(MONAD), { reliabilityClass: "LIQUIDITY" }),
]);

const destination = nodeFromAsset(usdc(BASE));

describe("planConsolidation", () => {
  it("routes native ETH after reserving gas, marks target balances and unroutable assets", async () => {
    const plan = await planConsolidation({
      wallet: "0x00000000000000000000000000000000000000aa",
      scan: scan({
        [`${SEP}:native`]: 10n ** 16n, // 0.01 ETH
        [`${BASE}:0xusdc`]: 1_300_000n, // already at target
        [`${MONAD}:native`]: 14n * 10n ** 18n, // MON: no live DEX quote
        [`${MONAD}:0xusdc`]: 2_000_000n, // Monad USDC: needs MON for gas, has 14 MON
      }),
      destination,
      mode: "BEST_OUTPUT",
      graph,
      providers: [dex, bridge],
      clients,
      assets,
      chains,
      fetch: globalThis.fetch,
    });

    const sep = plan.sources.find((s) => s.asset.id === `${SEP}:native`);
    expect(sep?.status).toBe("ROUTABLE");
    expect(sep?.selected?.edges.map((e) => e.type)).toEqual(["SWAP", "CCTP"]);
    // gas reserve: (200k swap + 200k bridge + 60k approval) * 1 gwei * 1.25 = 0.000575 ETH
    expect(sep?.gas.reserve).toBeGreaterThan(0n);
    expect(sep?.routable).toBe(10n ** 16n - sep!.gas.reserve);
    expect(sep?.selected?.amountOut).toBeGreaterThan(0n);

    const baseUsdc = plan.sources.find((s) => s.asset.id === `${BASE}:0xusdc`);
    expect(baseUsdc?.status).toBe("TARGET");

    const mon = plan.sources.find((s) => s.asset.id === `${MONAD}:native`);
    expect(mon?.status).toBe("NO_ROUTE");
    expect(mon?.reason).toBe("NO_LIQUIDITY");

    const monadUsdc = plan.sources.find((s) => s.asset.id === `${MONAD}:0xusdc`);
    expect(monadUsdc?.status).toBe("ROUTABLE");
    expect(monadUsdc?.selected?.edges.map((e) => e.type)).toEqual(["CCTP"]);

    expect(plan.stats.target).toBe(1);
    expect(plan.stats.routable).toBe(2);
    expect(plan.totalOut).toBe((sep?.selected?.amountOut ?? 0n) + (monadUsdc?.selected?.amountOut ?? 0n));
  });

  it("marks NEED_GAS with faucets when the source chain cannot pay for the route", async () => {
    const plan = await planConsolidation({
      wallet: "0x00000000000000000000000000000000000000aa",
      scan: scan({ [`${SEP}:0xusdc`]: 4_800_000n, [`${SEP}:native`]: 0n }),
      destination,
      mode: "BEST_OUTPUT",
      graph,
      providers: [dex, bridge],
      clients,
      assets,
      chains,
    });
    const src = plan.sources.find((s) => s.asset.id === `${SEP}:0xusdc`);
    expect(src?.status).toBe("NEED_GAS");
    expect(src?.reason).toBe("INSUFFICIENT_SOURCE_GAS");
    expect(src?.gas.shortfall).toBeGreaterThan(0n);
    expect(src?.faucets[0]?.assetId).toBe("ETH");
  });

  it("reports NO_STRUCTURAL_PATH when the graph has no path and can be re-scored per mode", async () => {
    const plan = await planConsolidation({
      wallet: "0x00000000000000000000000000000000000000aa",
      scan: scan({ [`${BASE}:native`]: 10n ** 16n }),
      destination,
      mode: "BEST_OUTPUT",
      graph,
      providers: [dex, bridge],
      clients,
      assets,
      chains,
    });
    const src = plan.sources[0];
    expect(src?.status).toBe("NO_ROUTE");
    expect(src?.reason).toBe("NO_BRIDGE_FOR_ASSET");
    const rescored = rescorePlan(plan, "FEWEST_TX");
    expect(rescored.mode).toBe("FEWEST_TX");
  });
});
