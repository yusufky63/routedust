import { CHAINS, FAUCETS, findChain } from "@testnet-router/registry";
import { DripFaucet } from "@/components/drip-faucet";
import { FaucetList } from "@/components/faucet-list";
import { FundsTabs } from "@/components/funds-tabs";
import { PageTitle } from "@/components/ui";
import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Faucets",
  description: `Testnet faucets for ${CHAINS.length} networks, easiest first, with what each one asks for; they open in a new tab and nothing is claimed for you.`,
  path: "/faucets",
});

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
            ? `Gas for ${focusChain.name} first. ${FAUCETS.length} external sources across ${CHAINS.length} testnets, opened in a new tab and never auto-claimed.`
            : `${FAUCETS.length} external sources across ${CHAINS.length} testnets, easiest first. Tags say what each one asks for; “Mainnet funds” turns a new wallet away and “Paid” costs real money. Nothing is auto-claimed and amounts are never promised.`
        }
      />
      <div className="grid-12">
        <div className="col-span-4 md:col-span-8">
          <FundsTabs active="faucets" />
        </div>
      </div>
      <DripFaucet focusChainId={focusChain?.id} />
      <FaucetList focusChainId={focusChain?.id} />
    </div>
  );
}
