import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/page-meta";

/** Route and batch pages hold one browser's own runs; the API is for the app. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/route/", "/batch/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
