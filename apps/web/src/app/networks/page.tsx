"use client";

import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { checkRpc } from "@testnet-router/core";
import { CHAINS, cctpDomainFor } from "@testnet-router/registry";
import { Button, ExternalLink, Marker, PageTitle, Tag, TableCard } from "@/components/ui";
import { addChainToWallet } from "@/lib/signer";
import { useRouterStore } from "@/lib/store";
import { isoDate } from "@/lib/format";

/** wallet_addEthereumChain with the registry's RPC: fixes wallets whose built-in testnet RPC is broken or missing. */
function AddToWallet({ chainId }: { chainId: number }) {
  const config = useConfig();
  const { address } = useAccount();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  if (!address) return <span className="mono text-xs text-muted">connect a wallet</span>;
  return (
    <div className="flex flex-col gap-1">
      <Button
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setError(undefined);
          try {
            await addChainToWallet(config, chainId);
            setState("done");
          } catch (err) {
            setState("error");
            setError(err instanceof Error ? err.message.split("\n")[0]?.slice(0, 80) : String(err));
          }
        }}
      >
        {state === "busy" ? "Adding…" : state === "done" ? "Added ✓" : "Add to wallet"}
      </Button>
      {error ? <span className="mono text-xs text-error">{error}</span> : null}
    </div>
  );
}

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
      <TableCard title="Chains" count={CHAINS.length}>
        <table className="table min-w-[820px]">
          <thead>
            <tr>
              <th>Network</th>
              <th>Chain ID</th>
              <th>Native gas</th>
              <th>Wrapped</th>
              <th>CCTP</th>
              <th>RPC health</th>
              <th>Wallet</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {CHAINS.map((chain, i) => {
              const h = health[i];
              const cctp = cctpDomainFor(chain.id);
              const data = h?.data;
              return (
                <tr key={chain.id}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 uppercase tracking-caps">
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
                    <div className="mono text-xs text-muted">
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
                  <td className="py-3 pr-4">
                    <AddToWallet chainId={chain.id} />
                  </td>
                  <td className="mono py-3 pr-4 text-xs text-muted">
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
      </TableCard>
    </div>
  );
}
