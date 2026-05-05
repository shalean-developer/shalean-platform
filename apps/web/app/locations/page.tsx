import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { LocationsIndexView } from "@/components/locations/LocationsIndexView";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/locations";
const CANONICAL_ABSOLUTE = absoluteCanonicalUrl(PATH);

const LOC_INDEX_META_DESC = clampMetaDescription(
  "Find trusted cleaners in your Cape Town suburb—transparent pricing, instant booking, and local hub guides for Sea Point, Claremont, Rondebosch, and more.",
);
const LOC_INDEX_OG_DESC = clampMetaDescription(
  "Browse suburb hubs, compare services, and book standard, deep, or move-out cleaning with upfront quotes.",
);
const LOC_INDEX_TWITTER_DESC = clampMetaDescription(
  "Find your area, open a local hub, and book cleaning with transparent pricing across Cape Town.",
);

export const metadata: Metadata = {
  title: "Cleaning Services Across Cape Town | Suburb Hubs | Shalean",
  description: LOC_INDEX_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL_ABSOLUTE },
  openGraph: {
    type: "website",
    url: CANONICAL_ABSOLUTE,
    title: "Cleaning Services Across Cape Town | Shalean",
    description: LOC_INDEX_OG_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Across Cape Town | Shalean",
    description: LOC_INDEX_TWITTER_DESC,
  },
};

export default function LocationsIndexPage() {
  return (
    <MarketingLayout>
      <LocationsIndexView />
    </MarketingLayout>
  );
}
