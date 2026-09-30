import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Liquidity",
  description: "Create a Uniswap v3 pool for your test token or add to an existing one, with exact approvals to the position manager only.",
  path: "/liquidity",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
