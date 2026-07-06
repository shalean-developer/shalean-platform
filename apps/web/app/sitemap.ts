import type { MetadataRoute } from "next";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildMarketingSitemapEntries();
}
