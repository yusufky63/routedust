import { CHAINS } from "@testnet-router/registry";
import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Balances",
  description: `A wallet's balances on ${CHAINS.length} testnets in one table, read straight from each network in your browser, for your own wallet or any address you watch.`,
  path: "/balances",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
