"use client";

import { formatAmount, formatSeconds, type ChainGroup, type RouteCandidate, type SourcePlan } from "@testnet-router/core";
import { chainExit, findChain, officialBridgeUrl, officialBridgesFor } from "@testnet-router/registry";
import { Button, ExternalLink, TableCard, Tag } from "./ui";
import { AssetIcon, ChainIcon } from "./icons";
import type { AmountState } from "@/hooks/use-route-amounts";
import type { GatewaySetView } from "@/hooks/use-gateway-set";
import { findAnyAsset } from "@/lib/assets";
import { PROVIDER_NAME } from "./route-card";

/** "Uniswap v3 → Circle CCTP": who does each step, repeats folded. */
function providerPath(c: RouteCandidate | undefined): string {
  const names = (c?.edges ?? []).map((e) => PROVIDER_NAME[e.provider] ?? e.provider);
  return names.filter((n, i) => n !== names[i - 1]).join(" → ");
}

/** What a balance's own row shows: the amount, the asset and where it sits. */
function SourceCell({ source, amount }: { source: SourcePlan; amount: bigint }) {
  const chain = findChain(source.sourceChainId);
  return (
    <div className="flex items-center gap-2">
      <AssetIcon asset={source.asset} size={16} />
      <div className="flex flex-col leading-tight">
        <span className="num whitespace-nowrap">
          {formatAmount(amount, source.asset.decimals)} {source.asset.symbol}
        </span>
        <span className="meta flex items-center gap-1 whitespace-nowrap">
          <ChainIcon chainId={source.sourceChainId} size={10} /> {chain?.shortName}
        </span>
      </div>
    </div>
  );
}

export interface CompactRoutesProps {
  sources: SourcePlan[];
  amounts: { state: Record<string, AmountState>; effective: (s: SourcePlan) => RouteCandidate | undefined };
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onExecute: (candidate: RouteCandidate) => void;
  disabled?: boolean;
  canExecute: boolean;
  executeHint?: string;
}

/** One row per route: what leaves, how, what arrives. Amounts and alternatives live in the detailed view. */
export function CompactRoutes({ sources, amounts, selected, onToggle, onExecute, disabled, canExecute, executeHint }: CompactRoutesProps) {
  if (sources.length === 0) return null;
  return (
    <TableCard>
      <table className="table min-w-[760px]">
        <thead>
          <tr>
            <th className="w-8" aria-label="Select" />
            <th>Send</th>
            <th>Route</th>
            <th className="text-right">Receive</th>
            <th>Time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const st = amounts.state[s.id];
            const c = amounts.effective(s);
            const amount = st?.amount ?? s.selected?.amountIn ?? 0n;
            const dest = c ? findAnyAsset(c.destination.assetId) : undefined;
            return (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} className="h-4 w-4 accent-[var(--accent)]" aria-label={`Select ${s.asset.symbol} on ${findChain(s.sourceChainId)?.shortName}`} />
                </td>
                <td>
                  <SourceCell source={s} amount={amount} />
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-sm">{providerPath(c ?? s.selected)}</span>
                    {s.status === "PARTIAL" ? <Tag tone="warn">PARTIAL</Tag> : null}
                    {!s.asset.verified ? <Tag tone="warn">UNVERIFIED</Tag> : null}
                  </div>
                  {st?.error ? <div className="meta text-error">{st.error.slice(0, 80)}</div> : null}
                </td>
                <td className="text-right">
                  <span className={`num whitespace-nowrap ${st?.quoting ? "text-muted" : ""}`}>
                    {c ? formatAmount(c.amountOut, dest?.decimals ?? 6) : st?.quoting ? "…" : "—"} <span className="text-muted">{dest?.symbol}</span>
                  </span>
                </td>
                <td className="meta whitespace-nowrap">{c ? `${formatSeconds(c.estimatedSeconds)} · ${c.txCount} TX` : "—"}</td>
                <td className="text-right">
                  <Button size="sm" onClick={() => c && onExecute(c)} disabled={disabled || !canExecute || !c || st?.quoting} title={executeHint}>
                    Execute
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableCard>
  );
}

export interface CompactPooledProps {
  gatewaySet?: GatewaySetView;
  groups: ChainGroup[];
  onExecuteSet: (view: GatewaySetView) => void;
  onExecuteGroup: (group: ChainGroup) => void;
  disabled?: boolean;
  canExecute: boolean;
  executeHint?: string;
}

/** Pooled bridges as rows: which balances travel together, what arrives, how many transactions. */
export function CompactPooled({ gatewaySet, groups, onExecuteSet, onExecuteGroup, disabled, canExecute, executeHint }: CompactPooledProps) {
  const rows: { key: string; label: React.ReactNode; out: bigint; destAssetId: string; tx: string; run: () => void }[] = [];
  if (gatewaySet) {
    const set = gatewaySet.set;
    rows.push({
      key: set.id,
      label: `Circle Gateway · ${set.legs.length} chains, one signature`,
      out: set.totalOut,
      destAssetId: set.collector.destination.assetId,
      tx: `${set.legs.reduce((n, l) => n + l.txCount, 0)} TX + 1 SIG`,
      run: () => onExecuteSet(gatewaySet),
    });
  }
  for (const g of groups) {
    rows.push({
      key: g.id,
      label: (
        <span className="flex items-center gap-1.5">
          <ChainIcon chainId={g.chainId} size={12} /> {findChain(g.chainId)?.shortName} · {g.legs.length} balances, one bridge
        </span>
      ),
      out: g.expectedOut,
      destAssetId: g.bridge.destination.assetId,
      tx: `${g.txCount} TX`,
      run: () => onExecuteGroup(g),
    });
  }
  if (rows.length === 0) return null;
  return (
    <TableCard title="Pooled bridges" count={rows.length}>
      <table className="table min-w-[640px]">
        <tbody>
          {rows.map((r) => {
            const dest = findAnyAsset(r.destAssetId);
            return (
              <tr key={r.key}>
                <td className="text-sm">{r.label}</td>
                <td className="text-right">
                  <span className="num whitespace-nowrap">
                    {formatAmount(r.out, dest?.decimals ?? 6)} <span className="text-muted">{dest?.symbol}</span>
                  </span>
                </td>
                <td className="meta whitespace-nowrap">{r.tx}</td>
                <td className="text-right">
                  <Button size="sm" onClick={r.run} disabled={disabled || !canExecute} title={executeHint}>
                    Execute
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableCard>
  );
}

/** Balances that cannot move yet, one line each: why, and the one link that helps (faucet or the network's own bridge). */
export function CompactBlocked({ title, sources, reason }: { title: string; sources: SourcePlan[]; reason: (s: SourcePlan) => string }) {
  if (sources.length === 0) return null;
  return (
    <TableCard title={title} count={sources.length}>
      <table className="table min-w-[640px]">
        <tbody>
          {sources.map((s) => {
            const chain = findChain(s.sourceChainId);
            const faucet = s.status === "NEED_GAS" ? s.faucets[0] : undefined;
            const exit = s.status === "NO_ROUTE" ? chainExit(s.sourceChainId) : undefined;
            const bridge = s.status === "NO_ROUTE" && !exit ? officialBridgesFor(s.sourceChainId)[0] : undefined;
            return (
              <tr key={s.id}>
                <td>
                  <SourceCell source={s} amount={s.balance} />
                </td>
                <td className="text-xs text-muted">{reason(s)}</td>
                <td className="text-right">
                  {faucet ? <ExternalLink href={faucet.url}>{faucet.name}</ExternalLink> : null}
                  {exit ? <ExternalLink href={exit.url}>{exit.name}</ExternalLink> : null}
                  {bridge ? <ExternalLink href={officialBridgeUrl(bridge, s.sourceChainId, bridge.counterparts[0])}>{bridge.name}</ExternalLink> : null}
                  {!faucet && !exit && !bridge && s.status === "NEED_GAS" ? <span className="meta">no faucet listed for {chain?.shortName}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableCard>
  );
}
