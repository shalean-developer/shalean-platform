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
          "/dashboard",
          "/account",
          "/auth",
          "/cleaner",
          "/booking/success",
          "/payment/success",
        ],
      },
    ],
    sitemap: "https://www.shalean.co.za/sitemap.xml",
  };
}
