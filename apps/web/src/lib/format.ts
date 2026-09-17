import type { EdgeHealth, OutputCanonicality, RouteExecutionState, SourceStatus, StepStatus } from "@testnet-router/core";
import { findAsset, findChain } from "@testnet-router/registry";

export function chainName(chainId: number): string {
  return findChain(chainId)?.name ?? `Chain ${chainId}`;
}

export function chainShort(chainId: number): string {
  return findChain(chainId)?.shortName ?? `#${chainId}`;
}

export function assetSymbol(assetId: string): string {
  return findAsset(assetId)?.symbol ?? assetId;
}

export function assetDecimals(assetId: string): number {
  return findAsset(assetId)?.decimals ?? 18;
}

export function txUrl(chainId: number, hash: string): string {
  const base = findChain(chainId)?.explorerUrl ?? "";
  return `${base}/tx/${hash}`;
}

export function addressUrl(chainId: number, address: string): string {
  const base = findChain(chainId)?.explorerUrl ?? "";
  return `${base}/address/${address}`;
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  ROUTABLE: "ROUTABLE",
  TARGET: "TARGET",
  NEED_GAS: "NEED GAS",
  NO_ROUTE: "NO ROUTE",
  PARTIAL: "PARTIAL",
  SKIPPED: "SKIPPED",
};

export const SOURCE_STATUS_TONE: Record<SourceStatus, "ok" | "warn" | "err" | "muted" | "accent"> = {
  ROUTABLE: "ok",
  TARGET: "accent",
  NEED_GAS: "warn",
  NO_ROUTE: "err",
  PARTIAL: "warn",
  SKIPPED: "muted",
};

export const CANON_LABEL: Record<OutputCanonicality, string> = {
  NATIVE: "NATIVE OUTPUT",
  CANONICAL: "CANONICAL OUTPUT",
  ISSUER_MANAGED: "ISSUER OUTPUT",
  WRAPPED: "WRAPPED OUTPUT",
};

export const HEALTH_LABEL: Record<EdgeHealth, string> = {
  STRUCTURAL: "STRUCTURAL",
  QUOTED: "LIVE QUOTE",
  SIMULATED: "SIMULATED",
  DEGRADED: "DEGRADED",
  UNAVAILABLE: "UNAVAILABLE",
};

export const EXEC_STATE_LABEL: Record<RouteExecutionState, string> = {
  PLANNED: "PLANNED",
  PREFLIGHT: "PREFLIGHT",
  NEEDS_CHAIN_SWITCH: "SWITCH NETWORK",
  NEEDS_APPROVAL: "APPROVAL",
  READY_TO_SIGN: "READY TO SIGN",
  SOURCE_SUBMITTED: "SUBMITTED",
  SOURCE_CONFIRMED: "CONFIRMED",
  CROSSCHAIN_PENDING: "CROSS-CHAIN PENDING",
  DESTINATION_EXECUTING: "DESTINATION",
  COMPLETED: "COMPLETED",
  PAUSED: "PAUSED",
  FAILED: "FAILED",
};

export const STEP_STATUS_TONE: Record<StepStatus, "ok" | "warn" | "err" | "muted" | "accent"> = {
  PENDING: "muted",
  READY: "accent",
  SUBMITTED: "accent",
  CONFIRMED: "ok",
  WAITING: "warn",
  COMPLETED: "ok",
  FAILED: "err",
  SKIPPED: "muted",
};

export function edgeLabel(type: string, provider: string): string {
  const p = provider
    .replace("circle-cctp", "circle")
    .replace("op-standard-bridge", "op bridge")
    .replace("uniswap-v4", "uniswap v4")
    .replace("uniswap-v2", "v2 amm")
    .toUpperCase();
  const t = type.replace(/_/g, " ");
  if (t === "CCTP" && provider === "circle-cctp") return "CCTP";
  if (t === "OP STANDARD BRIDGE") return "OP STANDARD BRIDGE";
  if (t === "HYPERLANE WARP") return "HYPERLANE WARP";
  if (t === "LIFI") return "LI.FI";
  return `${t} / ${p}`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}
