"use client";

import { useQueries } from "@tanstack/react-query";
import { checkRpc } from "@testnet-router/core";
import { CHAINS, cctpDomainFor } from "@testnet-router/registry";
import { ExternalLink, Marker, PageTitle, Tag } from "@/components/ui";
import { useRouterStore } from "@/lib/store";
import { isoDate } from "@/lib/format";

export default function NetworksPage() {
  const overrides = useRouterStore((s) => s.settings.rpcOverrides);
  const health = useQueries({
    queries: CHAINS.map((chain) => {
      const url = overrides[chain.id]?.trim() || chain.rpcUrls[0] || "";
      return {
        queryKey: ["rpc-health", chain.id, url],
        queryFn: () => checkRpc(url, chain.id),
        refetchInterval: 60_000,
        staleTime: 30_000,
      };
    }),
  });

  return (
    <div>
      <PageTitle title="Networks" meta="Static chain identity · runtime RPC health · native gas asset is a role, not ETH" />
      <div className="scroll-x">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="label text-left">
              <th className="py-2 pr-4 font-normal">Network</th>
              <th className="py-2 pr-4 font-normal">Chain ID</th>
              <th className="py-2 pr-4 font-normal">Native gas</th>
              <th className="py-2 pr-4 font-normal">Wrapped</th>
              <th className="py-2 pr-4 font-normal">CCTP</th>
              <th className="py-2 pr-4 font-normal">RPC health</th>
              <th className="py-2 pr-4 font-normal">Source</th>
            </tr>
          </thead>
          <tbody>
            {CHAINS.map((chain, i) => {
              const h = health[i];
              const cctp = cctpDomainFor(chain.id);
              const data = h?.data;
              return (
                <tr key={chain.id} className="rule align-top">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 uppercase tracking-[0.06em]">
                      <Marker color={chain.color} />
                      {chain.name}
                    </div>
                    <div className="mt-1">
                      <ExternalLink href={chain.explorerUrl}>{chain.explorerUrl.replace(/^https?:\/\//, "")}</ExternalLink>
                    </div>
                  </td>
                  <td className="mono py-3 pr-4">{chain.id}</td>
                  <td className="py-3 pr-4">
                    <div className="display">{chain.nativeAsset.symbol}</div>
                    <div className="mono text-[11px] text-muted">
                      {chain.nativeAsset.decimals} dec
                      {chain.nativeAsset.erc20Mirror ? ` · ERC-20 mirror ${chain.nativeAsset.erc20Mirror.decimals} dec` : ""}
                    </div>
                  </td>
                  <td className="mono py-3 pr-4 text-xs">
                    {chain.nativeAsset.wrappedAddress ? (
                      <span title={chain.nativeAsset.wrappedAddress}>
                        {chain.nativeAsset.wrappedSymbol} {chain.nativeAsset.wrappedVerified ? <Tag tone="ok">VERIFIED</Tag> : <Tag tone="warn">UNVERIFIED</Tag>}
                      </span>
                    ) : (
                      <span className="text-muted">none verified</span>
                    )}
                  </td>
                  <td className="mono py-3 pr-4 text-xs">
                    {cctp ? (
                      <span>
                        domain {cctp.domain} {cctp.fastTransfer ? <Tag tone="accent">FAST</Tag> : <Tag>STANDARD</Tag>}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono py-3 pr-4 text-xs">
                    {h?.isLoading ? (
                      <Tag>CHECKING</Tag>
                    ) : data ? (
                      <div className="flex flex-col gap-1">
                        <Tag tone={data.status === "UP" ? "ok" : data.status === "DEGRADED" ? "warn" : "err"}>{data.status}</Tag>
                        <span className="text-muted">
                          {data.latencyMs}ms{data.blockNumber !== undefined ? ` · block ${data.blockNumber.toString()}` : ""}
                        </span>
                        {data.error ? <span className="text-error">{data.error.slice(0, 80)}</span> : null}
                        <span className="text-muted">{data.url.replace(/^https?:\/\//, "")}</span>
                      </div>
                    ) : (
                      <Tag tone="err">DOWN</Tag>
                    )}
                  </td>
                  <td className="mono py-3 pr-4 text-[11px] text-muted">
                    {chain.source.kind} · {isoDate(chain.source.lastVerifiedAt)}
                    <div>
                      <ExternalLink href={chain.source.url}>source</ExternalLink>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
