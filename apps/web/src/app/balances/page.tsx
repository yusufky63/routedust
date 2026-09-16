"use client";

import { useAccount } from "wagmi";
import { AssetMatrix } from "@/components/asset-matrix";
import { Button, Empty, PageTitle, useMounted } from "@/components/ui";
import { useScan } from "@/hooks/use-scan";
import { useRouterStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";

export default function BalancesPage() {
  const mounted = useMounted();
  const { address } = useAccount();
  const { scan, scanning, rescan } = useScan();
  const plan = useRouterStore((s) => s.plan);
  if (!mounted) return null;

  return (
    <div>
      <PageTitle title="Balances" meta={scan ? `${scan.wallet} · scanned ${timeAgo(scan.scannedAt)}` : "Cross-testnet wallet inventory"}>
        <Button onClick={() => void rescan()} disabled={!address || scanning}>
          {scanning ? "Scanning…" : "Rescan"}
        </Button>
      </PageTitle>
      {!address ? <Empty title="Connect a wallet" hint="Balances are read directly from public RPCs in your browser. Nothing is sent to a server." /> : null}
      {address && !scan ? <Empty title={scanning ? "Scanning…" : "No scan yet"} /> : null}
      {scan ? <AssetMatrix scan={scan} plan={plan} /> : null}
    </div>
  );
}
