import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { AirbnbAreaServiceLanding } from "@/components/seo/AirbnbAreaServiceLanding";
import { AIRBNB_AREA_LANDINGS } from "@/lib/seo/airbnbAreaLandingPages";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";

const block = AIRBNB_AREA_LANDINGS["sea-point"];
const canonical = absoluteCanonicalUrl(block.path);

export const metadata: Metadata = {
  title: block.title,
  description: block.description,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: block.title,
    description: block.description,
    images: [{ url: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp", alt: block.h1 }],
  },
  twitter: {
    card: "summary_large_image",
    title: block.title,
    description: block.description,
    images: [`${SITE_ORIGIN}/images/marketing/airbnb-cleaning-cape-town-living-room.webp`],
  },
};

export default function AirbnbCleaningSeaPointPage() {
  return (
    <MarketingLayout>
      <AirbnbAreaServiceLanding block={block} />
    </MarketingLayout>
  );
}
