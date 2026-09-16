import type { Asset, AssetNode } from "../types/asset";
import { BRIDGE_EDGE_TYPES, type CapabilityEdge, type PlannerLimits, type RouteEdgeType } from "../types/route";

export function nodeId(node: Pick<AssetNode, "chainId" | "canonicalAssetId" | "representation">): string {
  return `${node.chainId}:${node.canonicalAssetId}:${node.representation}`;
}

export function nodeFromAsset(asset: Asset): AssetNode {
  return {
    chainId: asset.chainId,
    canonicalAssetId: asset.canonicalAssetId,
    representation: asset.representation,
    assetId: asset.id,
  };
}

export function sameNode(a: AssetNode, b: AssetNode): boolean {
  return nodeId(a) === nodeId(b);
}

export function isBridgeEdge(type: RouteEdgeType): boolean {
  return BRIDGE_EDGE_TYPES.has(type);
}

export function isSwapEdge(type: RouteEdgeType): boolean {
  return type === "SWAP";
}

export interface PathSearchOptions {
  maxSwaps: number;
  maxBridges: number;
  maxTotalSteps: number;
  /** Allow leaving the destination chain once reached / revisiting chains. */
  experimentalRoutes: boolean;
  /** Allow bridge-after-bridge relays through an intermediate chain (planner fallback). */
  allowBridgeRelay?: boolean;
  /** Hard cap on enumerated paths to avoid pathological fan-out. */
  maxPaths?: number;
}

export type CapabilityPath = CapabilityEdge[];

/**
 * Directed multigraph over (chain, canonical asset, representation) nodes.
 * Multiple providers may connect the same pair of nodes.
 */
export class CapabilityGraph {
  private readonly edgesById = new Map<string, CapabilityEdge>();
  private readonly outgoing = new Map<string, CapabilityEdge[]>();
  private readonly nodes = new Map<string, AssetNode>();

  constructor(edges: Iterable<CapabilityEdge> = []) {
    for (const e of edges) this.addEdge(e);
  }

  addEdge(edge: CapabilityEdge): void {
    if (this.edgesById.has(edge.id)) return;
    this.edgesById.set(edge.id, edge);
    const from = nodeId(edge.from);
    const to = nodeId(edge.to);
    this.nodes.set(from, edge.from);
    this.nodes.set(to, edge.to);
    const list = this.outgoing.get(from);
    if (list) list.push(edge);
    else this.outgoing.set(from, [edge]);
  }

  get size(): number {
    return this.edgesById.size;
  }

  edges(): CapabilityEdge[] {
    return [...this.edgesById.values()];
  }

  nodeList(): AssetNode[] {
    return [...this.nodes.values()];
  }

  edge(id: string): CapabilityEdge | undefined {
    return this.edgesById.get(id);
  }

  outgoingFrom(node: AssetNode): CapabilityEdge[] {
    return this.outgoing.get(nodeId(node)) ?? [];
  }

  hasNode(node: AssetNode): boolean {
    return this.nodes.has(nodeId(node));
  }

  /**
   * Enumerate structurally possible simple paths from `from` to `to`.
   * Bounded by swap / bridge / total step counts. Chains are never revisited
   * and the destination chain is never left unless experimental routes are on.
   */
  findPaths(from: AssetNode, to: AssetNode, options: PathSearchOptions): CapabilityPath[] {
    const target = nodeId(to);
    const start = nodeId(from);
    const results: CapabilityPath[] = [];
    const maxPaths = options.maxPaths ?? 64;
    if (start === target) return results;

    const visitedNodes = new Set<string>([start]);
    const visitedChains = new Set<number>([from.chainId]);
    const path: CapabilityEdge[] = [];

    const dfs = (current: string, swaps: number, bridges: number): void => {
      if (results.length >= maxPaths) return;
      if (path.length >= options.maxTotalSteps) return;
      const currentNode = this.nodes.get(current);
      if (!currentNode) return;
      const onDestinationChain = currentNode.chainId === to.chainId;
      const previous = path[path.length - 1];

      for (const edge of this.outgoing.get(current) ?? []) {
        const next = nodeId(edge.to);
        if (visitedNodes.has(next)) continue;

        const bridge = isBridgeEdge(edge.type);
        const swap = isSwapEdge(edge.type);
        const nextSwaps = swaps + (swap ? 1 : 0);
        const nextBridges = bridges + (bridge ? 1 : 0);
        if (nextSwaps > options.maxSwaps) continue;
        if (nextBridges > options.maxBridges) continue;

        // A wrap/unwrap that leads nowhere new is pointless.
        if ((edge.type === "WRAP" || edge.type === "UNWRAP") && next !== target && this.isDeadEndWrap(current, edge)) continue;
        // After a wrap/unwrap, a continuation the pre-wrap node already offers
        // (e.g. WRAP -> SWAP when the DEX accepts native directly) is dominated.
        if (previous && (previous.type === "WRAP" || previous.type === "UNWRAP") && this.hasTwin(nodeId(previous.from), edge)) continue;

        if (edge.crossChain) {
          if (onDestinationChain && !options.experimentalRoutes) continue;
          if (visitedChains.has(edge.to.chainId) && !options.experimentalRoutes) continue;
          // Bridge-after-bridge relays through an intermediate chain without doing
          // anything there. They only add gas, latency and quote traffic.
          if (previous?.crossChain && !options.experimentalRoutes && !options.allowBridgeRelay) continue;
          // A cross-chain edge that does not land on the destination chain is
          // only useful if we can still bridge again.
          if (edge.to.chainId !== to.chainId && nextBridges >= options.maxBridges) continue;
        }

        path.push(edge);
        visitedNodes.add(next);
        const addedChain = edge.crossChain && !visitedChains.has(edge.to.chainId);
        if (addedChain) visitedChains.add(edge.to.chainId);

        if (next === target) {
          results.push([...path]);
        } else {
          dfs(next, nextSwaps, nextBridges);
        }

        if (addedChain) visitedChains.delete(edge.to.chainId);
        visitedNodes.delete(next);
        path.pop();
        if (results.length >= maxPaths) return;
      }
    };

    dfs(start, 0, 0);
    return results.sort((a, b) => a.length - b.length);
  }

  private isDeadEndWrap(current: string, wrap: CapabilityEdge): boolean {
    const after = (this.outgoing.get(nodeId(wrap.to)) ?? []).filter((e) => nodeId(e.to) !== current);
    return after.length === 0;
  }

  /** True when `from` already has an edge with the same provider, type and destination as `edge`. */
  private hasTwin(from: string, edge: CapabilityEdge): boolean {
    const target = nodeId(edge.to);
    return (this.outgoing.get(from) ?? []).some((m) => m.provider === edge.provider && m.type === edge.type && nodeId(m.to) === target);
  }
}

export function pathSearchOptions(limits: PlannerLimits): PathSearchOptions {
  return {
    maxSwaps: limits.maxSwaps,
    maxBridges: limits.maxBridges,
    maxTotalSteps: limits.maxTotalSteps,
    experimentalRoutes: limits.experimentalRoutes,
  };
}

export function describePath(path: CapabilityPath): string {
  return path.map((e) => `${e.type}/${e.provider}`).join(" → ");
}
