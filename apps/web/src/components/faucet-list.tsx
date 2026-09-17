"use client";

import type { FaucetRef } from "@testnet-router/core";
import { CHAINS, FAUCETS } from "@testnet-router/registry";
import { ExternalLink, Marker, Tag } from "./ui";
import { isoDate } from "@/lib/format";

const SOURCE_LABEL: Record<FaucetRef["source"], string> = {
  CHAIN_OFFICIAL: "OFFICIAL",
  PROTOCOL_OFFICIAL: "OFFICIAL ECOSYSTEM",
  THIRD_PARTY: "THIRD PARTY",
};

export function FaucetEntry({ faucet }: { faucet: FaucetRef }) {
  return (
    <div className="flex flex-col gap-1 py-2 md:flex-row md:items-baseline md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{faucet.name}</span>
          <Tag tone={faucet.source === "THIRD_PARTY" ? "muted" : "ok"}>{SOURCE_LABEL[faucet.source]}</Tag>
          {faucet.requiresAuth ? <Tag>LOGIN</Tag> : null}
          {faucet.health === "VERIFIED_RECENTLY" ? <Tag tone="accent">VERIFIED</Tag> : null}
          {faucet.health === "REPORTED_DOWN" ? <Tag tone="err">REPORTED DOWN</Tag> : null}
        </div>
        {faucet.notes ? <div className="text-xs text-muted">{faucet.notes}</div> : null}
        <div className="mono text-[11px] text-muted">last verified {isoDate(faucet.lastVerifiedAt)} · supplies {faucet.assetId === "*" ? "various" : faucet.assetId}</div>
      </div>
      <ExternalLink href={faucet.url}>{faucet.url.replace(/^https?:\/\//, "")}</ExternalLink>
    </div>
  );
}

export function FaucetList({ focusChainId }: { focusChainId?: number } = {}) {
  const multi = FAUCETS.filter((f) => f.chainId === 0);
  // A ?chain= deep link (from a gas error) puts that chain first and marks it.
  const ordered = focusChainId ? [...CHAINS].sort((a, b) => (a.id === focusChainId ? -1 : b.id === focusChainId ? 1 : 0)) : CHAINS;
  return (
    <div className="flex flex-col gap-8">
      {ordered.map((chain) => {
        const own = FAUCETS.filter((f) => f.chainId === chain.id);
        const shared = multi.filter((f) => f.chainIds?.includes(chain.id));
        return (
          <section key={chain.id} id={`chain-${chain.id}`} className={`grid-12 ${chain.id === focusChainId ? "module !border-accent !p-4" : ""}`}>
            <div className="col-span-4 md:col-span-3">
              <div className="flex items-center gap-2 uppercase tracking-[0.08em]">
                <Marker color={chain.color} />
                <span className="display">{chain.name}</span>
              </div>
              <div className="label mt-1">
                {chain.nativeAsset.symbol} / GAS{chain.nativeAsset.erc20Mirror ? " · also ERC-20 USDC" : ""}
              </div>
            </div>
            <div className="col-span-4 md:col-span-9">
              {own.map((f) => (
                <div key={f.id} className="rule">
                  <FaucetEntry faucet={f} />
                </div>
              ))}
              {shared.length > 0 ? (
                <div className="rule pt-2">
                  <div className="label mb-1">Alternative sources</div>
                  {shared.map((f) => (
                    <FaucetEntry key={f.id} faucet={f} />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
