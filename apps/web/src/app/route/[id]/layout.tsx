import type { Metadata } from "next";
import { pageMeta } from "@/lib/page-meta";

/** A route run lives in one browser's storage: never indexed. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMeta({
    title: `Route ${id.slice(-6).toUpperCase()}`,
    description: "One route run from this browser: its steps, transactions and progress, with retry and resume.",
    path: `/route/${encodeURIComponent(id)}`,
    noindex: true,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
