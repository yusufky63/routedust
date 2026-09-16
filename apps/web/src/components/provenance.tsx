"use client";

import { formatAmount, type RouteCandidate, type RouteEdge } from "@testnet-router/core";
import { findAsset } from "@testnet-router/registry";
import { ExternalLink, KeyValue, Label, Rule } from "./ui";
import { chainName, edgeLabel, pad2 } from "@/lib/format";

function metaRows(edge: RouteEdge): [string, React.ReactNode][] {
  const rows: [string, React.ReactNode][] = [];
  const meta = (edge.meta ?? {}) as Record<string, unknown>;
  if (typeof meta.sourceDomain === "number" && typeof meta.destinationDomain === "number") {
    rows.push(["CCTP domains", `${meta.sourceDomain} → ${meta.destinationDomain}`]);
  }
  const raw = (edge.quote.raw ?? {}) as Record<string, unknown>;
  if (typeof raw.pool === "string") rows.push(["Pool", raw.pool]);
  if (typeof raw.fee === "number") rows.push(["Fee tier", `${raw.fee / 10_000}%`]);
  if (typeof raw.minFinalityThreshold === "number") rows.push(["Finality threshold", String(raw.minFinalityThreshold)]);
  if (typeof raw.spokePool === "string") rows.push(["SpokePool", raw.spokePool]);
  if (typeof meta.l1StandardBridge === "string") rows.push(["L1StandardBridge", meta.l1StandardBridge]);
  return rows;
}

/** "Why this route?" drawer: path, sources and freshness for every edge (spec section 32). */
export function RouteProvenance({ candidate }: { candidate: RouteCandidate }) {
  return (
    <div className="flex flex-col gap-4">
      {candidate.edges.map((edge, i) => {
        const from = findAsset(edge.from.assetId);
        const to = findAsset(edge.to.assetId);
        return (
          <div key={edge.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="mono text-xs text-muted">{pad2(i + 1)}</span>
              <span className="display text-sm uppercase">{edgeLabel(edge.type, edge.provider)}</span>
              <span className="mono text-xs text-muted">{edge.healthNote}</span>
            </div>
            <KeyValue
              rows={[
                ["Input", `${formatAmount(edge.quote.amountIn, from?.decimals ?? 18)} ${from?.symbol} on ${chainName(edge.from.chainId)} (${edge.from.representation})`],
                ["Output", `${formatAmount(edge.quote.amountOut, to?.decimals ?? 18)} ${to?.symbol} on ${chainName(edge.to.chainId)} (${edge.to.representation})`],
                ["Canonical output", edge.outputCanonicality],
                ["Reliability", edge.reliabilityClass.replace(/_/g, " ")],
                ["Source", `${edge.source.kind}`],
                ["Source URL", <ExternalLink key="u" href={edge.source.url}>{edge.source.url.replace(/^https?:\/\//, "").slice(0, 60)}</ExternalLink>],
                ["Last checked", new Date(edge.source.lastVerifiedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"],
                ["Quote expires", new Date(edge.quote.expiresAt).toLocaleTimeString()],
                ...(edge.source.note ? ([["Note", edge.source.note]] as [string, React.ReactNode][]) : []),
                ...(edge.trustMetadata?.sourceRegistry ? ([["Registry", edge.trustMetadata.sourceRegistry]] as [string, React.ReactNode][]) : []),
                ...metaRows(edge),
              ]}
            />
            {i < candidate.edges.length - 1 ? <Rule /> : null}
          </div>
        );
      })}
      <Rule />
      <div>
        <Label>Score breakdown ({candidate.scoreBreakdown ? candidate.scoreBreakdown.total.toFixed(3) : "n/a"})</Label>
        {candidate.scoreBreakdown ? (
          <KeyValue
            rows={Object.entries(candidate.scoreBreakdown)
              .filter(([k]) => k !== "total")
              .map(([k, v]) => [k, v.toFixed(3)])}
          />
        ) : null}
      </div>
    </div>
  );
}
