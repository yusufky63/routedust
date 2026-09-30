import { pageMeta } from "@/lib/page-meta";

export const metadata = pageMeta({
  title: "Protocols",
  description: "The swap and bridge providers RouteDust uses and every route each one confirmed live in the latest discovery, with where it came from.",
  path: "/protocols",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
