import type { MetadataRoute } from "next";
import { isCustomerFacingProduction } from "@/lib/env/deploymentEnvironment";
import { seoRobotsDisallowPaths } from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";

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
        allow: "/",
        disallow: seoRobotsDisallowPaths(),
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
