"use client";

import { formatAmount, type ConsolidationPlan, type SourcePlan, type SourceStatus, type WalletScan } from "@testnet-router/core";
import { CHAINS, faucetsForChain } from "@testnet-router/registry";
import { ExternalLink, KeyValue, Tag } from "./ui";
import { AssetIcon, ChainIcon } from "./icons";
import { SOURCE_STATUS_LABEL, SOURCE_STATUS_TONE, addressUrl, isoDate } from "@/lib/format";

type RowStatus = SourceStatus | "SCANNED" | "EMPTY" | "RPC ERROR";

const ORDER: RowStatus[] = ["ROUTABLE", "PARTIAL", "TARGET", "NEED_GAS", "NO_ROUTE", "SKIPPED", "SCANNED", "EMPTY", "RPC ERROR"];

function rowStatus(ok: boolean, hasBalance: boolean, sources: SourcePlan[]): RowStatus {
  if (!ok) return "RPC ERROR";
  if (!hasBalance) return "EMPTY";
  if (sources.length === 0) return "SCANNED";
  if (sources.some((s) => s.status === "ROUTABLE")) return sources.every((s) => s.status === "ROUTABLE" || s.status === "TARGET") ? "ROUTABLE" : "PARTIAL";
  if (sources.some((s) => s.status === "TARGET")) return "TARGET";
  if (sources.some((s) => s.status === "NEED_GAS")) return "NEED_GAS";
  if (sources.some((s) => s.status === "NO_ROUTE")) return "NO_ROUTE";
  return "SKIPPED";
}

function tone(status: RowStatus) {
  if (status === "SCANNED" || status === "EMPTY") return "muted" as const;
  if (status === "RPC ERROR") return "err" as const;
  return SOURCE_STATUS_TONE[status];
}

function label(status: RowStatus): string {
  if (status === "SCANNED" || status === "EMPTY" || status === "RPC ERROR") return status;
  return SOURCE_STATUS_LABEL[status];
}

export function AssetMatrix({ scan, plan, compact = false }: { scan: WalletScan; plan?: ConsolidationPlan; compact?: boolean }) {
  const rows = CHAINS.map((chain) => {
    const result = scan.chains.find((c) => c.chainId === chain.id);
    const balances = result?.balances ?? [];
    const native = balances.find((b) => b.asset.kind === "NATIVE");
    const others = balances.filter((b) => b.asset.kind !== "NATIVE" && b.raw > 0n);
    const sources = plan?.sources.filter((s) => s.sourceChainId === chain.id) ?? [];
    const hasBalance = balances.some((b) => b.raw > 0n);
    const status = rowStatus(result?.ok ?? false, hasBalance, sources);
    return { chain, result, native, others, sources, status, balances };
  }).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="label text-left">
            <th className="py-2 pr-4 font-normal">Network</th>
            <th className="py-2 pr-4 font-normal">Native</th>
            <th className="py-2 pr-4 font-normal">Other</th>
            <th className="py-2 pr-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chain.id} className="rule align-top">
              <td className="py-3 pr-4" colSpan={compact ? 1 : undefined}>
                <details className="group">
                  <summary className="flex items-center gap-2 uppercase tracking-[0.06em]">
                    <ChainIcon chainId={r.chain.id} size={14} />
                    <span>{r.chain.name}</span>
                    <span className="mono text-[10px] text-muted group-open:hidden">+</span>
                    <span className="mono hidden text-[10px] text-muted group-open:inline">−</span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3 text-xs normal-case tracking-normal">
                    {r.result?.error ? <div className="text-error">{r.result.error}</div> : null}
                    {r.balances.map((b) => {
                      const src = r.sources.find((s) => s.asset.id === b.asset.id);
                      return (
                        <div key={b.asset.id} className="module-raised p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="display">{b.asset.symbol}</span>
                            <span className="num text-muted">{b.formatted}</span>
                            {!b.asset.verified ? <Tag tone="warn">UNVERIFIED</Tag> : null}
                            {src ? <Tag tone={SOURCE_STATUS_TONE[src.status]}>{SOURCE_STATUS_LABEL[src.status]}</Tag> : null}
                            {src?.reason ? <Tag>{src.reason.replace(/_/g, " ")}</Tag> : null}
                          </div>
                          <KeyValue
                            rows={[
                              ["Identity", b.asset.id],
                              ["Kind", `${b.asset.kind} / ${b.asset.representation}`],
                              ["Decimals", String(b.asset.decimals)],
                              ...(b.asset.address
                                ? ([["Contract", <ExternalLink key="c" href={addressUrl(b.asset.chainId, b.asset.address)}>{b.asset.address}</ExternalLink>]] as [string, React.ReactNode][])
                                : ([["Contract", "native (eth_getBalance)"]] as [string, React.ReactNode][])),
                              ...(r.chain.nativeAsset.erc20Mirror && b.asset.kind === "NATIVE"
                                ? ([["ERC-20 mirror", `${r.chain.nativeAsset.erc20Mirror.address} (${r.chain.nativeAsset.erc20Mirror.decimals} decimals)`]] as [string, React.ReactNode][])
                                : []),
                              ["Issuer", b.asset.issuer ?? "—"],
                              ["Verified", b.asset.verified ? "yes" : "no"],
                              ["Source", b.asset.source ? `${b.asset.source.kind} · ${isoDate(b.asset.source.lastVerifiedAt)}` : "—"],
                              ...(src && src.status === "NEED_GAS"
                                ? ([["Gas shortfall", `${formatAmount(src.gas.shortfall, 18)} ${r.chain.nativeAsset.symbol}`]] as [string, React.ReactNode][])
                                : []),
                            ]}
                          />
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap gap-3">
                      {faucetsForChain(r.chain.id).map((f) => (
                        <ExternalLink key={f.id} href={f.url}>
                          {f.name}
                        </ExternalLink>
                      ))}
                      <ExternalLink href={`${r.chain.explorerUrl}/address/${scan.wallet}`}>Explorer</ExternalLink>
                    </div>
                  </div>
                </details>
              </td>
              <td className="num py-3 pr-4">
                {r.native ? (
                  <span className="flex items-center gap-2">
                    <AssetIcon asset={r.native.asset} size={14} />
                    <span>
                      {r.native.formatted} <span className="text-muted">{r.native.asset.symbol}</span>
                    </span>
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="num py-3 pr-4">
                {r.others.length > 0 ? (
                  <div className="flex flex-col">
                    {r.others.slice(0, 5).map((b) => (
                      <span key={b.asset.id} className="flex items-center gap-2">
                        <AssetIcon asset={b.asset} size={14} />
                        <span>
                          {b.formatted} <span className="text-muted">{b.asset.symbol}</span>
                        </span>
                        {!b.asset.verified ? <Tag tone="warn">UNVERIFIED</Tag> : null}
                      </span>
                    ))}
                    {r.others.length > 5 ? <span className="mono text-[11px] text-muted">+{r.others.length - 5} more (expand)</span> : null}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="py-3 pr-4">
                <Tag tone={tone(r.status)}>{label(r.status)}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
