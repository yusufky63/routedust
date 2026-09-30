import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/page-meta";

type Entry = [path: string, changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>, priority: number];

/** Every public page. Route and batch pages are per-browser and stay out. */
const PAGES: Entry[] = [
  ["/", "daily", 1],
  ["/swap", "weekly", 0.8],
  ["/swap/bridge", "weekly", 0.8],
  ["/balances", "weekly", 0.7],
  ["/bridges", "weekly", 0.7],
  ["/faucets", "weekly", 0.8],
  ["/networks", "weekly", 0.6],
  ["/protocols", "daily", 0.6],
  ["/coverage", "weekly", 0.4],
  ["/liquidity", "monthly", 0.5],
  ["/activity", "monthly", 0.4],
  ["/settings", "monthly", 0.3],
  ["/docs", "weekly", 0.7],
  ["/how-it-works", "monthly", 0.7],
  ["/status", "always", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(([path, changeFrequency, priority]) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
