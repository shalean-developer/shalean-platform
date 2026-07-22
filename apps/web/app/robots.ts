import type { MetadataRoute } from "next";
import { isCustomerFacingProduction } from "@/lib/env/deploymentEnvironment";
import { seoRobotsAllowPaths, seoRobotsDisallowPaths } from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";

/**
 * Production robots.txt.
 *
 * Important: robots.txt is a crawl hint for compliant bots — it is NOT an
 * access-control or security mechanism. Private cleaner routes still require
 * authentication via middleware / app code even when Disallow'd here.
 *
 * Intended cleaner rules (Google longest-match):
 *   Disallow: /cleaner/
 *   Allow: /cleaner/apply$
 * so only the recruitment landing is crawlable; `/cleaner/apply/form` stays blocked.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isCustomerFacingProduction()) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: seoRobotsAllowPaths(),
        disallow: seoRobotsDisallowPaths(),
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
