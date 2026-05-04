import type { MetadataRoute } from "next";

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
    sitemap: "https://www.shalean.co.za/sitemap.xml",
  };
}
