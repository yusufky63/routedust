import { FAUCETS, findChain } from "@testnet-router/registry";
import { FaucetList } from "@/components/faucet-list";
import { PageTitle } from "@/components/ui";
import { pad2 } from "@/lib/format";

export const metadata = { title: "Faucet Center" };

export default async function FaucetsPage({ searchParams }: { searchParams: Promise<{ chain?: string }> }) {
  const { chain } = await searchParams;
  const focus = chain ? Number(chain) : undefined;
  const focusChain = focus ? findChain(focus) : undefined;
  return (
    <div>
      <PageTitle
        title={`Faucets / ${pad2(FAUCETS.length)}`}
        meta={focusChain ? `Gas for ${focusChain.name} first · external sources · never auto-claimed` : "External sources · opened in a new tab · never auto-claimed · amounts are never promised"}
      />
      <FaucetList focusChainId={focusChain?.id} />
    </div>
  );
}
