import { FAUCETS } from "@testnet-router/registry";
import { FaucetList } from "@/components/faucet-list";
import { PageTitle } from "@/components/ui";
import { pad2 } from "@/lib/format";

export const metadata = { title: "Faucet Center · Testnet Router" };

export default function FaucetsPage() {
  return (
    <div>
      <PageTitle title={`Faucets / ${pad2(FAUCETS.length)}`} meta="External sources · opened in a new tab · never auto-claimed · amounts are never promised" />
      <FaucetList />
    </div>
  );
}
