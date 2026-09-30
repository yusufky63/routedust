import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Bridge",
  description: "Send any amount of one asset to another testnet through the bridges that are live right now, with a swap before or after when the pair needs one.",
  path: "/swap/bridge",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
