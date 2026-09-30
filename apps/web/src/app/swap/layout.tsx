import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Swap",
  description: "Swap one asset for another on the same testnet through live DEX pools, with the price impact shown and your own wallet signing.",
  path: "/swap",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
