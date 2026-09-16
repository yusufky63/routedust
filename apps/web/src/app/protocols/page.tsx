"use client";

import { SOURCES } from "@testnet-router/registry";
import { Button, ExternalLink, Label, Module, PageTitle, Tag } from "@/components/ui";
import { useDiscovery } from "@/hooks/use-discovery";
import { chainShort, edgeLabel, timeAgo } from "@/lib/format";

const PLANNED = [
  { name: "Circle Gateway", note: "Unified USDC balance (optional consolidation strategy)", source: SOURCES.circleGateway },
  { name: "Circle Forwarding Service", note: "Destination mint + gas covered by fee", source: SOURCES.circleForwarding },
  { name: "LI.FI", note: "External route candidate and sanity check", source: SOURCES.lifiChains },
  { name: "LayerZero OFT / Stargate", note: "Asset-level OFT / pool routes only", source: SOURCES.layerzeroOft },
  { name: "Wormhole NTT / wrapped", note: "Issuer NTT first; wrapped only when allowed", source: SOURCES.wormholeDocs },
  { name: "Hyperlane Warp Routes", note: "Registered warp routes with provenance", source: SOURCES.hyperlaneRegistry },
];

export default function ProtocolsPage() {
  const discovery = useDiscovery();
  const data = discovery.data;

  return (
    <div>
      <PageTitle title="Protocols" meta="Provider capabilities discovered at runtime · every edge carries its source">
        <Button onClick={() => void discovery.refetch()} disabled={discovery.isFetching}>
          {discovery.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </PageTitle>

      <div className="scroll-x">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="label text-left">
              <th className="py-2 pr-4 font-normal">Provider</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 pr-4 font-normal">Edges</th>
              <th className="py-2 pr-4 font-normal">Chains</th>
              <th className="py-2 pr-4 font-normal">Source</th>
              <th className="py-2 pr-4 font-normal">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {(data?.summaries ?? []).map((s) => (
              <tr key={s.key} className="rule align-top">
                <td className="py-3 pr-4 display">{s.name}</td>
                <td className="py-3 pr-4">
                  <Tag tone={s.ok ? "ok" : "err"}>{s.ok ? "LIVE" : "UNAVAILABLE"}</Tag>
                  {s.error ? <div className="mono mt-1 text-[11px] text-error">{s.error.slice(0, 120)}</div> : null}
                </td>
                <td className="mono py-3 pr-4">{s.edges}</td>
                <td className="mono py-3 pr-4 text-xs">{s.chains.map(chainShort).join(" · ") || "—"}</td>
                <td className="mono py-3 pr-4 text-[11px]">
                  <ExternalLink href={s.source.url}>{s.source.url.replace(/^https?:\/\//, "").slice(0, 48)}</ExternalLink>
                  {s.source.note ? <div className="text-muted">{s.source.note.slice(0, 120)}</div> : null}
                </td>
                <td className="mono py-3 pr-4 text-[11px] text-muted">{timeAgo(s.discoveredAt)}</td>
              </tr>
            ))}
            {discovery.isLoading ? (
              <tr>
                <td className="py-3 text-muted" colSpan={6}>
                  Discovering…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {data ? (
        <Module className="mt-6">
          <Label>Live capability edges · {data.graph.size}</Label>
          <div className="scroll-x mt-3">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="label text-left">
                  <th className="py-1 pr-4 font-normal">Edge</th>
                  <th className="py-1 pr-4 font-normal">From</th>
                  <th className="py-1 pr-4 font-normal">To</th>
                  <th className="py-1 pr-4 font-normal">Output</th>
                  <th className="py-1 pr-4 font-normal">Reliability</th>
                  <th className="py-1 pr-4 font-normal">Gas</th>
                </tr>
              </thead>
              <tbody>
                {data.edges.map((e) => (
                  <tr key={e.id} className="rule mono">
                    <td className="py-1 pr-4 uppercase">{edgeLabel(e.type, e.provider)}</td>
                    <td className="py-1 pr-4">
                      {chainShort(e.from.chainId)} / {e.from.canonicalAssetId} <span className="text-muted">{e.from.representation}</span>
                    </td>
                    <td className="py-1 pr-4">
                      {chainShort(e.to.chainId)} / {e.to.canonicalAssetId} <span className="text-muted">{e.to.representation}</span>
                    </td>
                    <td className="py-1 pr-4">{e.outputCanonicality}</td>
                    <td className="py-1 pr-4">{e.reliabilityClass.replace(/_/g, " ")}</td>
                    <td className="py-1 pr-4">
                      {e.requiresSourceGas ? "src" : ""}
                      {e.requiresDestinationGas ? " + dst" : ""}
                      {e.requiresApproval ? " · approval" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Module>
      ) : null}

      <Module className="mt-6">
        <Label>Coverage providers · planned (spec phase 4)</Label>
        <div className="mt-3 flex flex-col">
          {PLANNED.map((p) => (
            <div key={p.name} className="rule flex flex-col gap-1 py-2 md:flex-row md:items-baseline md:justify-between">
              <div>
                <span className="text-sm">{p.name}</span>
                <span className="ml-2 text-xs text-muted">{p.note}</span>
              </div>
              <ExternalLink href={p.source.url}>{p.source.url.replace(/^https?:\/\//, "").slice(0, 48)}</ExternalLink>
            </div>
          ))}
        </div>
      </Module>
    </div>
  );
}
