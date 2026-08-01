import type { MetadataRoute } from "next";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";

/**
 * Blog posts are published from the database without a web deployment.
 * Rebuild the sitemap periodically so newly published canonical URLs do not
 * remain stuck at the list captured during the last production build.
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildMarketingSitemapEntries();
}
