import { describe, expect, it } from "vitest";
import type { AssetNode, CapabilityEdge, RouteEdgeType } from "../types";
import { CapabilityGraph, describePath, nodeId } from "./multigraph";

const SEP = 11155111;
const BASE = 84532;
const OP = 11155420;

function node(chainId: number, asset: string, representation: AssetNode["representation"] = "CANONICAL"): AssetNode {
  return { chainId, canonicalAssetId: asset, representation, assetId: `${chainId}:${asset.toLowerCase()}` };
}

const sepEth = node(SEP, "ETH", "NATIVE");
const sepUsdc = node(SEP, "USDC", "CIRCLE_NATIVE");
const baseEth = node(BASE, "ETH", "NATIVE");
const baseUsdc = node(BASE, "USDC", "CIRCLE_NATIVE");
const opUsdc = node(OP, "USDC", "CIRCLE_NATIVE");
const baseWeth = node(BASE, "WETH", "WRAPPED_NATIVE");

let counter = 0;
function edge(type: RouteEdgeType, from: AssetNode, to: AssetNode, provider = type.toLowerCase()): CapabilityEdge {
  counter += 1;
  return {
    id: `${provider}:${type}:${nodeId(from)}>${nodeId(to)}:${counter}`,
    provider,
    type,
    from,
    to,
    crossChain: from.chainId !== to.chainId,
    requiresApproval: false,
    requiresSourceGas: true,
    requiresDestinationGas: false,
    outputCanonicality: to.representation === "WRAPPED_NATIVE" ? "WRAPPED" : "CANONICAL",
    reliabilityClass: "CANONICAL",
    baselineGasUnits: 100_000n,
    baselineSeconds: 30,
    source: { kind: "manual", url: "test", lastVerifiedAt: "2026-09-16T00:00:00Z" },
  };
}

const opts = { maxSwaps: 2, maxBridges: 2, maxTotalSteps: 5, experimentalRoutes: false };

describe("CapabilityGraph", () => {
  it("enumerates structurally possible paths only", () => {
    const g = new CapabilityGraph([
      edge("SWAP", sepEth, sepUsdc, "uniswap"),
      edge("CCTP", sepUsdc, baseUsdc, "circle"),
      edge("ACROSS", sepEth, baseEth, "across"),
      edge("SWAP", baseEth, baseUsdc, "uniswap"),
      edge("WRAP", baseEth, baseWeth, "wrap"),
    ]);
    const paths = g.findPaths(sepEth, baseUsdc, opts);
    const described = paths.map(describePath);
    expect(described).toContain("SWAP/uniswap → CCTP/circle");
    expect(described).toContain("ACROSS/across → SWAP/uniswap");
    expect(paths).toHaveLength(2);
  });

  it("returns no path when only messaging-style edges exist elsewhere", () => {
    const g = new CapabilityGraph([edge("CCTP", sepUsdc, baseUsdc, "circle")]);
    expect(g.findPaths(sepEth, baseUsdc, opts)).toHaveLength(0);
    expect(g.hasNode(sepEth)).toBe(false);
  });

  it("respects bridge caps and only relays bridge-after-bridge in experimental mode", () => {
    const g = new CapabilityGraph([
      edge("CCTP", sepUsdc, opUsdc, "circle"),
      edge("CCTP", opUsdc, baseUsdc, "circle"),
      edge("CCTP", sepUsdc, baseUsdc, "circle"),
    ]);
    const direct = g.findPaths(sepUsdc, baseUsdc, { ...opts, maxBridges: 2 });
    expect(direct).toHaveLength(1);
    expect(direct[0]?.[0]?.to.chainId).toBe(BASE);
    const experimental = g.findPaths(sepUsdc, baseUsdc, { ...opts, maxBridges: 2, experimentalRoutes: true });
    expect(experimental).toHaveLength(2);
    const one = g.findPaths(sepUsdc, baseUsdc, { ...opts, maxBridges: 1, experimentalRoutes: true });
    expect(one).toHaveLength(1);
  });

  it("allows a second bridge when a swap happens on the intermediate chain", () => {
    const opEth = node(OP, "ETH", "NATIVE");
    const g = new CapabilityGraph([
      edge("CCTP", sepUsdc, opUsdc, "circle"),
      edge("SWAP", opUsdc, opEth, "uniswap"),
      edge("ACROSS", opEth, baseEth, "across"),
    ]);
    const paths = g.findPaths(sepUsdc, baseEth, opts);
    expect(paths).toHaveLength(1);
    expect(describePath(paths[0] ?? [])).toBe("CCTP/circle → SWAP/uniswap → ACROSS/across");
  });

  it("never leaves the destination chain or revisits a chain unless experimental", () => {
    const g = new CapabilityGraph([
      edge("CCTP", sepUsdc, baseUsdc, "circle"),
      edge("CCTP", baseUsdc, opUsdc, "circle"),
      edge("CCTP", opUsdc, baseUsdc, "circle"),
      edge("SWAP", baseUsdc, baseEth, "uniswap"),
    ]);
    const paths = g.findPaths(sepUsdc, baseEth, opts);
    expect(paths).toHaveLength(1);
    expect(describePath(paths[0] ?? [])).toBe("CCTP/circle → SWAP/uniswap");
  });

  it("drops wrap detours whose continuation the native node already offers", () => {
    const sepWeth = node(SEP, "WETH", "WRAPPED_NATIVE");
    const g = new CapabilityGraph([
      edge("WRAP", sepEth, sepWeth, "wrap"),
      edge("UNWRAP", sepWeth, sepEth, "wrap"),
      edge("SWAP", sepEth, sepUsdc, "uniswap"),
      edge("SWAP", sepWeth, sepUsdc, "uniswap"),
      edge("CCTP", sepUsdc, baseUsdc, "circle"),
      edge("ACROSS", sepWeth, baseWeth, "across"),
    ]);
    const toUsdc = g.findPaths(sepEth, baseUsdc, opts).map(describePath);
    expect(toUsdc).toEqual(["SWAP/uniswap → CCTP/circle"]);
    // WRAP -> ACROSS is kept: the native node has no ACROSS edge to Base WETH.
    const toWeth = g.findPaths(sepEth, baseWeth, opts).map(describePath);
    expect(toWeth).toEqual(["WRAP/wrap → ACROSS/across"]);
  });

  it("supports multiple providers between the same nodes (multigraph)", () => {
    const g = new CapabilityGraph([
      edge("CCTP", sepUsdc, baseUsdc, "circle"),
      edge("ACROSS", sepUsdc, baseUsdc, "across"),
    ]);
    expect(g.size).toBe(2);
    expect(g.findPaths(sepUsdc, baseUsdc, opts)).toHaveLength(2);
  });
});
