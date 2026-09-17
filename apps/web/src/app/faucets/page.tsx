import { CHAINS, FAUCETS, findChain } from "@testnet-router/registry";
import { DripFaucet } from "@/components/drip-faucet";
import { FaucetList } from "@/components/faucet-list";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "Faucet Center" };

export default async function FaucetsPage({ searchParams }: { searchParams: Promise<{ chain?: string }> }) {
  const { chain } = await searchParams;
  const focus = chain ? Number(chain) : undefined;
  const focusChain = focus ? findChain(focus) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Faucets"
        meta={
          focusChain
            ? `Gas for ${focusChain.name} first: the RouteDust faucet, then ${FAUCETS.length} external sources across ${CHAINS.length} testnets.`
            : `The RouteDust faucet for common testnets, then ${FAUCETS.length} external sources across ${CHAINS.length} testnets (new tab, never auto-claimed).`
        }
      />
      <DripFaucet focusChainId={focusChain?.id} />
      <section className="flex flex-col gap-2">
        <h2 className="display border-b border-border pb-2 text-lg">Official and ecosystem faucets</h2>
        <FaucetList focusChainId={focusChain?.id} />
      </section>
    </div>
  );
}
