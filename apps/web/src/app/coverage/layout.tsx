import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Coverage",
  description: "Which testnets each bridge and swap provider supports right now, compiled from their public registries and compared with the networks RouteDust runs on.",
  path: "/coverage",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
