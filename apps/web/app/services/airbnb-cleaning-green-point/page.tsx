import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { AirbnbAreaServiceLanding } from "@/components/seo/AirbnbAreaServiceLanding";
import { AIRBNB_AREA_LANDINGS } from "@/lib/seo/airbnbAreaLandingPages";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const block = AIRBNB_AREA_LANDINGS["green-point"];
const canonical = absoluteCanonicalUrl(block.path);
const metaDescription = clampMetaDescription(block.description);

export const metadata: Metadata = {
  title: block.title,
  description: metaDescription,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: block.title,
    description: metaDescription,
    images: [{ url: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp", alt: block.h1 }],
  },
  twitter: {
    card: "summary_large_image",
    title: block.title,
    description: metaDescription,
    images: [`${SITE_ORIGIN}/images/marketing/airbnb-cleaning-cape-town-living-room.webp`],
  },
};

export default function AirbnbCleaningGreenPointPage() {
  return (
    <MarketingLayout>
      <AirbnbAreaServiceLanding block={block} />
    </MarketingLayout>
  );
}
