import type { MetadataRoute } from "next";
import { seoRobotsDisallowPaths } from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: seoRobotsDisallowPaths(),
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
