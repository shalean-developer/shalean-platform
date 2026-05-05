import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site/canonical";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api",
          "/cleaner",
          "/payment",
          "/pay",
          "/offer",
          "/dashboard",
          "/account",
          "/auth",
          "/booking/success",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
