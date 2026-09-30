import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Activity",
  description: "Your route and batch history, kept in this browser, with unfinished USDC transfers to recover and rollup withdrawals to prove and finish.",
  path: "/activity",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
