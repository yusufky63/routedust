import { CHAINS, FAUCETS, findChain } from "@testnet-router/registry";
import { FaucetList } from "@/components/faucet-list";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "Faucet Center" };

export default async function FaucetsPage({ searchParams }: { searchParams: Promise<{ chain?: string }> }) {
  const { chain } = await searchParams;
  const focus = chain ? Number(chain) : undefined;
  const focusChain = focus ? findChain(focus) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <PageTitle
        title="Faucets"
        meta={
          focusChain
            ? `Gas for ${focusChain.name} first. ${FAUCETS.length} external sources across ${CHAINS.length} testnets, opened in a new tab and never auto-claimed.`
            : `${FAUCETS.length} external sources across ${CHAINS.length} testnets. Links open in a new tab, nothing is auto-claimed and amounts are never promised.`
        }
      />
      <FaucetList focusChainId={focusChain?.id} />
    </div>
  );
}
