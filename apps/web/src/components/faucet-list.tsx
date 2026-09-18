"use client";

import type { FaucetRef } from "@testnet-router/core";
import { CHAINS, FAUCETS } from "@testnet-router/registry";
import { ChainIcon } from "./icons";
import { Tag } from "./ui";
import { isoDate } from "@/lib/format";

const SOURCE_LABEL: Record<FaucetRef["source"], string> = {
  CHAIN_OFFICIAL: "Official",
  PROTOCOL_OFFICIAL: "Ecosystem",
  THIRD_PARTY: "Third party",
};

function host(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

/** One faucet row: name and tags, notes, verification line; the whole row links out. */
export function FaucetEntry({ faucet, dense = false, multiChain = false }: { faucet: FaucetRef; dense?: boolean; multiChain?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${dense ? "py-1.5" : "py-2.5"}`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={faucet.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium underline-offset-2 hover:underline">
            {faucet.name}
          </a>
          <Tag tone={faucet.source === "THIRD_PARTY" ? "muted" : "ok"}>{SOURCE_LABEL[faucet.source]}</Tag>
          {faucet.requiresAuth ? <Tag>Login</Tag> : null}
          {faucet.health === "VERIFIED_RECENTLY" ? <Tag tone="accent">Verified</Tag> : null}
          {faucet.health === "REPORTED_DOWN" ? <Tag tone="err">Reported down</Tag> : null}
          {multiChain ? <Tag tone="muted">Multi-chain</Tag> : null}
        </div>
        {!dense && faucet.notes ? <p className="text-xs text-muted">{faucet.notes}</p> : null}
        <p className="meta truncate">
          {host(faucet.url)} · verified {isoDate(faucet.lastVerifiedAt)} · {faucet.assetId === "*" ? "various assets" : faucet.assetId}
        </p>
      </div>
      <a href={faucet.url} target="_blank" rel="noreferrer noopener" className="btn btn-sm shrink-0" aria-label={`Open ${faucet.name}`}>
        Open <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

/**
 * One module per chain in a two-column grid; multi-chain faucets are listed
 * once at the end and only referenced by name under each chain they serve.
 */
export function FaucetList({ focusChainId }: { focusChainId?: number } = {}) {
  const multi = FAUCETS.filter((f) => f.chainId === 0);
  // A ?chain= deep link (from a gas error) puts that chain first and marks it.
  const ordered = focusChainId ? [...CHAINS].sort((a, b) => (a.id === focusChainId ? -1 : b.id === focusChainId ? 1 : 0)) : CHAINS;
  return (
    <div className="flex flex-col gap-8">
      <nav className="flex flex-wrap gap-1.5" aria-label="Jump to a chain">
        {ordered.map((chain) => (
          <a key={chain.id} href={`#chain-${chain.id}`} className={`btn btn-sm ${chain.id === focusChainId ? "btn-active" : ""}`}>
            <ChainIcon chainId={chain.id} size={14} /> {chain.shortName}
          </a>
        ))}
      </nav>

      <div className="grid-12">
        {ordered.map((chain) => {
          const own = FAUCETS.filter((f) => f.chainId === chain.id);
          const shared = multi.filter((f) => f.chainIds?.includes(chain.id));
          return (
            <section key={chain.id} id={`chain-${chain.id}`} className={`module col-span-4 flex scroll-mt-20 flex-col md:col-span-6 ${chain.id === focusChainId ? "module-selected" : ""}`}>
              <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="flex items-center gap-2">
                  <ChainIcon chainId={chain.id} size={18} />
                  <span className="display text-base">{chain.name}</span>
                </span>
                <span className="label">
                  {chain.nativeAsset.symbol} gas{chain.nativeAsset.erc20Mirror ? " · ERC-20 USDC" : ""}
                </span>
              </header>
              <div className="flex flex-col divide-y divide-border">
                {own.length === 0 && shared.length === 0 ? <p className="py-2.5 text-sm text-muted">No faucet listed for this network yet.</p> : null}
                {own.map((f) => (
                  <FaucetEntry key={f.id} faucet={f} />
                ))}
                {shared.map((f) => (
                  <FaucetEntry key={f.id} faucet={f} multiChain />
                ))}
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}
