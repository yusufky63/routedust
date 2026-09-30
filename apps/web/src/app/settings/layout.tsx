import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Settings",
  description: "Route mode, slippage, gas reserve, routing filters and your own RPC endpoints, all kept in this browser.",
  path: "/settings",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
