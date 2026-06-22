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
          "/office",
          "/api",
          "/cleaner",
          "/payment",
          "/pay",
          "/offer",
          "/dashboard",
          "/account",
          "/auth",
          "/track",
          "/lp",
          "/login",
          "/account/success",
          "/booking/success",
          "/growth/local/",
          "/location/",
          "/locations/",
          "/deep-cleaning/",
          "/move-out-cleaning/",
          "/airbnb-cleaning/",
          "/same-day-cleaning/",
          "/office-cleaning/",
          "/cleaning-services/",
          "/cleaning-services-cape-town",
          "/cleaning-prices-cape-town",
          "/maid-services-cape-town",
          "/johannesburg/",
          "/cape-town/cleaning-services/",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
