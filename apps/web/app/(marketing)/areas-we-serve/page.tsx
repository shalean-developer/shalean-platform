import type { Metadata } from "next";
import { AreasWeServeView } from "@/components/marketing-home/AreasWeServeView";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/areas-we-serve";
const CANONICAL = absoluteCanonicalUrl(PATH);

const PAGE_TITLE = clipSerpTitle("Areas We Serve Cape Town | Shalean Cleaning");

const META_DESC = clampMetaDescription(
  "See every Cape Town suburb Shalean cleans—Atlantic Seaboard, Southern Suburbs, City Bowl, Northern Suburbs, and Blouberg. Tap your area and book online.",
);

const OG_DESC = clampMetaDescription(
  "Browse serviced Cape Town suburbs by region, open your local hub, and book standard, deep, or move-out cleaning with transparent pricing.",
);

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL, languages: { "en-ZA": CANONICAL } },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: PAGE_TITLE,
    description: OG_DESC,
    imageAlt: "Cape Town suburbs Shalean cleaning services",
  }),
};

export default function AreasWeServePage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-background text-foreground">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <AreasWeServeView />
      <SiteFooter />
    </div>
  );
}
