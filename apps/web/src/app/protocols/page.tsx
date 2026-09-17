"use client";

import { SOURCES } from "@testnet-router/registry";
import { Button, ExternalLink, Module, PageTitle, TableCard, Tag } from "@/components/ui";
import { useDiscovery } from "@/hooks/use-discovery";
import { chainShort, edgeLabel, timeAgo } from "@/lib/format";

const PLANNED = [
  { name: "Circle Gateway", note: "Unified USDC balance (optional consolidation strategy)", source: SOURCES.circleGateway },
  { name: "LayerZero OFT / Stargate", note: "Asset-level OFT / pool routes only", source: SOURCES.layerzeroOft },
  { name: "Wormhole NTT / wrapped", note: "Issuer NTT first; wrapped only when allowed", source: SOURCES.wormholeDocs },
];

export default function ProtocolsPage() {
  const discovery = useDiscovery();
  const data = discovery.data;
  const live = data ? data.summaries.filter((s) => s.ok).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Protocols" meta="Provider capabilities discovered at runtime. Every edge carries its source.">
        <Button onClick={() => void discovery.refetchFresh()} disabled={discovery.isFetching}>
          {discovery.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </PageTitle>

      <TableCard
        title="Providers"
        count={data?.summaries.length}
        hint={data ? `${live} of ${data.summaries.length} answering · discovered ${timeAgo(Math.max(...data.summaries.map((s) => s.discoveredAt)))}` : "Shared discovery, cached for five minutes"}
      >
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Edges</th>
              <th>Chains</th>
              <th>Source</th>
              <th>Discovered</th>
            </tr>
          </thead>
          <tbody>
            {(data?.summaries ?? []).map((s) => (
              <tr key={s.key}>
                <td className="display">{s.name}</td>
                <td>
                  <Tag tone={s.ok ? "ok" : "err"}>{s.ok ? "Live" : "Unavailable"}</Tag>
                  {s.error ? <div className="mono mt-1 text-xs text-error">{s.error.slice(0, 120)}</div> : null}
                </td>
                <td className="mono">{s.edges}</td>
                <td className="mono text-xs">{s.chains.map(chainShort).join(" · ") || "—"}</td>
                <td className="mono text-xs">
                  <ExternalLink href={s.source.url}>{s.source.url.replace(/^https?:\/\//, "").slice(0, 48)}</ExternalLink>
                  {s.source.note ? <div className="text-muted">{s.source.note.slice(0, 120)}</div> : null}
                </td>
                <td className="mono text-xs text-muted">{timeAgo(s.discoveredAt)}</td>
              </tr>
            ))}
            {discovery.isLoading ? (
              <tr>
                <td className="text-muted" colSpan={6}>
                  Discovering…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      {data ? (
        <TableCard title="Live capability edges" count={data.graph.size} hint="Every edge below answered a probe quote or was verified on-chain during discovery.">
          <table className="table min-w-[720px] text-xs">
            <thead>
              <tr>
                <th>Edge</th>
                <th>From</th>
                <th>To</th>
                <th>Output</th>
                <th>Reliability</th>
                <th>Gas</th>
              </tr>
            </thead>
            <tbody>
              {data.edges.map((e) => (
                <tr key={e.id} className="mono">
                  <td className="py-1.5 uppercase">{edgeLabel(e.type, e.provider)}</td>
                  <td className="py-1.5">
                    {chainShort(e.from.chainId)} / {e.from.canonicalAssetId} <span className="text-muted">{e.from.representation}</span>
                  </td>
                  <td className="py-1.5">
                    {chainShort(e.to.chainId)} / {e.to.canonicalAssetId} <span className="text-muted">{e.to.representation}</span>
                  </td>
                  <td className="py-1.5">{e.outputCanonicality}</td>
                  <td className="py-1.5">{e.reliabilityClass.replace(/_/g, " ")}</td>
                  <td className="py-1.5">
                    {e.requiresSourceGas ? "src" : ""}
                    {e.requiresDestinationGas ? " + dst" : ""}
                    {e.requiresApproval ? " · approval" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      ) : null}

      <Module className="flex flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="display text-base">Planned providers</h2>
          <span className="label">spec phase 4</span>
        </header>
        <div className="flex flex-col divide-y divide-border">
          {PLANNED.map((p) => (
            <div key={p.name} className="flex flex-col gap-1 py-3 md:flex-row md:items-baseline md:justify-between">
              <div>
                <span className="text-sm font-medium">{p.name}</span>
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
