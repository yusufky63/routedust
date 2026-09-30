import { CHAINS } from "@testnet-router/registry";
import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Networks",
  description: `The ${CHAINS.length} testnets RouteDust supports: chain ID, gas asset, CCTP domain, own bridge and live RPC health, with a button to add each one to your wallet.`,
  path: "/networks",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
