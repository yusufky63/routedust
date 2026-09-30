import type { Metadata } from "next";

export const SITE_NAME = "RouteDust";
export const SITE_URL = "https://routedust.xyz";

/** The root opengraph-image: a segment that sets its own `openGraph` loses the inherited file image, so it is repeated here. */
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "RouteDust — testnet router" };

/**
 * Per-page metadata. Next merges metadata shallowly (a page's `openGraph`
 * replaces the layout's), so every page gets its own full set: canonical,
 * og:url, og:title, twitter. The title is absolute: a nested layout with a
 * plain string title (swap → swap/bridge) would otherwise drop the root
 * template, and og/twitter titles never get it.
 */
export function pageMeta({ title, description, path, noindex = false }: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  const full = `${title} · ${SITE_NAME}`;
  return {
    title: { absolute: full },
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, siteName: SITE_NAME, type: "website", locale: "en_US", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
