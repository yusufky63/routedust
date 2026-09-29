import Link from "next/link";
import { CHAINS, OFFICIAL_BRIDGES, cctpDomainFor, chainExit, findChain, officialBridgesFor, type OfficialBridge } from "@testnet-router/registry";
import { FundsTabs } from "@/components/funds-tabs";
import { ChainIcon } from "@/components/icons";
import { Module, PageTitle, Tag } from "@/components/ui";
import { isoDate } from "@/lib/format";

export const metadata = { title: "Bridges" };

function host(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function BridgeEntry({ bridge }: { bridge: OfficialBridge }) {
  const to = bridge.counterparts.map((id) => findChain(id)?.shortName ?? String(id)).join(", ");
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={bridge.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium underline-offset-2 hover:underline">
            {bridge.name}
          </a>
          <Tag tone={bridge.firstParty ? "ok" : "muted"}>{bridge.firstParty ? "Official" : "Third party"}</Tag>
          <Tag tone="muted">↔ {to}</Tag>
        </div>
        <p className="text-xs text-muted">{bridge.note}</p>
        <p className="meta truncate">
          {host(bridge.url)} · verified {isoDate(bridge.source.lastVerifiedAt)}
        </p>
      </div>
      <a href={bridge.url} target="_blank" rel="noreferrer noopener" className="btn btn-sm shrink-0" aria-label={`Open ${bridge.name}`}>
        Open <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

/**
 * Each testnet's own bridge UI (or the one its docs send users to) and the
 * manual way off chains with no live route. Links, never routes: live quotes
 * are on Swap → Bridge.
 */
export default function BridgesPage() {
  const withBridge = CHAINS.filter((c) => officialBridgesFor(c.id).length > 0 || chainExit(c.id));
  // Sepolia is the other end of these bridges, not a chain without one.
  const counterparts = new Set(OFFICIAL_BRIDGES.flatMap((b) => b.counterparts));
  const without = CHAINS.filter((c) => !withBridge.includes(c) && !counterparts.has(c.id));
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Bridges"
        meta={`${OFFICIAL_BRIDGES.length} bridge sites for ${withBridge.length} of ${CHAINS.length} testnets, each checked against the chain's own docs. They open in a new tab; RouteDust does not quote or run them.`}
      >
        <Link href="/swap/bridge" className="btn btn-accent">
          Bridge with a live quote
        </Link>
      </PageTitle>
      <div className="grid-12">
        <div className="col-span-4 md:col-span-8">
          <FundsTabs active="bridges" />
        </div>
      </div>

      <div className="grid-12">
        {withBridge.map((chain) => {
          const bridges = officialBridgesFor(chain.id);
          const exit = chainExit(chain.id);
          return (
            <section key={chain.id} id={`chain-${chain.id}`} className="module col-span-4 flex scroll-mt-20 flex-col md:col-span-6">
              <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="flex items-center gap-2">
                  <ChainIcon chainId={chain.id} size={18} />
                  <span className="display text-base">{chain.name}</span>
                </span>
                <span className="label">{bridges.length > 0 ? `${bridges.length} bridge${bridges.length > 1 ? "s" : ""}` : "way off"}</span>
              </header>
              <div className="flex flex-col divide-y divide-border">
                {bridges.map((b) => (
                  <BridgeEntry key={b.id} bridge={b} />
                ))}
                {exit ? (
                  <div className="flex items-start justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">Withdrawing to Ethereum Sepolia</span>
                        <Tag tone="warn">Only way off</Tag>
                      </div>
                      <p className="text-xs text-muted">{exit.note}</p>
                    </div>
                    <Link href="/activity" className="btn btn-sm shrink-0">
                      Activity
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <Module className="flex flex-col gap-3">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <span className="display text-base">No bridge site of their own</span>
          <span className="label">{without.length} testnets</span>
        </header>
        <p className="text-sm text-muted">
          These testnets had no bridge UI of their own at the last check. Where Circle CCTP runs, USDC still moves through{" "}
          <Link href="/swap/bridge" className="link-action">
            Swap → Bridge
          </Link>
          .
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {without.map((chain) => (
            <li key={chain.id} className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-sm">
              <ChainIcon chainId={chain.id} size={14} />
              {chain.shortName}
              {cctpDomainFor(chain.id) ? <Tag tone="muted">CCTP</Tag> : null}
            </li>
          ))}
        </ul>
      </Module>
    </div>
  );
}
