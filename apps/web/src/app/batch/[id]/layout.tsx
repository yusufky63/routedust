import type { Metadata } from "next";
import { pageMeta } from "@/lib/page-meta";

/** A batch lives in one browser's storage: never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMeta({
    title: `Batch ${id.slice(-4).toUpperCase()}`,
    description: "Routes run one after another from this browser, each signed in your own wallet.",
    path: `/batch/${encodeURIComponent(id)}`,
    noindex: true,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
