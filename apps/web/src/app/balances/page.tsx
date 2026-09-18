"use client";

import { useState } from "react";
import { AssetMatrix, type MatrixSort } from "@/components/asset-matrix";
import { WalletButton } from "@/components/wallet-button";
import { WatchAddressForm, WatchSwitcher } from "@/components/watch-address";
import { Button, Empty, PageTitle, Select, useMounted, TableCard } from "@/components/ui";
import { useScan } from "@/hooks/use-scan";
import { useRouterStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";

export default function BalancesPage() {
  const mounted = useMounted();
  // The watched address counts as well: the page is read-only either way.
  const { scan, scanning, rescan, address } = useScan();
  const plan = useRouterStore((s) => s.plan);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [sort, setSort] = useState<MatrixSort>("status");
  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Balances" meta={scan ? `${scan.wallet} · scanned ${timeAgo(scan.scannedAt)}` : "Cross-testnet wallet inventory"}>
        <Button active={hideEmpty} onClick={() => setHideEmpty(!hideEmpty)}>
          {hideEmpty ? "Hiding empty" : "Showing empty"}
        </Button>
        <Select
          ariaLabel="Sort balances"
          value={sort}
          onChange={setSort}
          className="w-44"
          align="right"
          options={[
            { value: "status", label: "By route status" },
            { value: "chain", label: "By chain name" },
            { value: "native", label: "By native balance" },
            { value: "expected", label: "By expected on target" },
          ]}
        />
        <Button onClick={() => void rescan()} disabled={!address || scanning}>
          {scanning ? "Scanning…" : "Rescan"}
        </Button>
      </PageTitle>
      {!address ? (
        <div className="module module-empty flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col gap-1">
            <div className="display text-lg">Connect a wallet, or watch any address</div>
            <p className="text-sm text-muted">Balances are read directly from public RPCs in your browser. Nothing is sent to a server.</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <WalletButton />
            <span className="meta">or</span>
            <WatchAddressForm />
          </div>
        </div>
      ) : null}
      {address ? <WatchSwitcher /> : null}
      {address && !scan ? <Empty title={scanning ? "Scanning…" : "No scan yet"} /> : null}
      {scan ? (
        <TableCard>
          <AssetMatrix scan={scan} plan={plan} hideEmpty={hideEmpty} sort={sort} />
        </TableCard>
      ) : null}
    </div>
  );
}
