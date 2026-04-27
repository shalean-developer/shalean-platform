import type { MetadataRoute } from "next";
import { getLocationsByCity } from "@/lib/locations";
import { SERVICES } from "@/lib/services";

const BASE = "https://www.shalean.co.za";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: BASE, lastModified },
    { url: `${BASE}/services`, lastModified },
    ...SERVICES.map((s) => ({
      url: `${BASE}/services/${s.slug}`,
      lastModified,
    })),
    ...getLocationsByCity("cape-town").map((loc) => ({
      url: `${BASE}/cleaning-services/${loc.slug}`,
      lastModified,
    })),
  ];

  return entries;
}
