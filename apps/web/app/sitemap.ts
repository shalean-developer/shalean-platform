import type { MetadataRoute } from "next";
import { PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { BLOG_POST_SLUGS } from "@/lib/blog/posts";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";

const BASE = "https://www.shalean.co.za";

/** Public index URLs only: `/`, `/services`, `/services/*`, `/locations/*`, `/blog/*`. Legacy `/cape-town/cleaning-services/*` is excluded (308 → `/locations/…`). */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: BASE, lastModified },
    { url: `${BASE}/services`, lastModified },
    { url: `${BASE}/blog`, lastModified },
    ...BLOG_POST_SLUGS.map((slug) => ({
      url: `${BASE}/blog/${slug}`,
      lastModified,
    })),
    ...PROGRAMMATIC_POSTS.map((post) => ({
      url: `${BASE}/blog/${post.slug}`,
      lastModified,
    })),
    ...Object.values(CAPE_TOWN_SERVICE_SEO).map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified,
    })),
    ...Object.values(LOCATION_SEO_PAGES).map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified,
    })),
  ];

  return entries;
}
