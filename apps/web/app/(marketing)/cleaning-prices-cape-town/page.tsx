import type { Metadata } from "next";
import { CleaningPricesCapeTownPage } from "@/components/marketing-pricing/CleaningPricesCapeTownPage";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { getHomePageData } from "@/lib/home/data";
import { buildHubCleaningServiceLinks } from "@/lib/marketing/hubCleaningServiceLinks";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import {
  CLEANING_PRICES_META_DESCRIPTION,
  CLEANING_PRICES_META_TITLE,
  CLEANING_PRICES_META_TWITTER_DESCRIPTION,
  CLEANING_PRICES_OG_IMAGE,
  cleaningPricesHubCanonicalUrl,
} from "@/lib/seo/marketingCleaningPricesHubMeta";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const CANONICAL = cleaningPricesHubCanonicalUrl();

export const metadata: Metadata = {
  title: CLEANING_PRICES_META_TITLE,
  description: CLEANING_PRICES_META_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: CLEANING_PRICES_META_TITLE,
    description: CLEANING_PRICES_META_DESCRIPTION,
    images: [{ url: CLEANING_PRICES_OG_IMAGE, alt: "Professional home cleaning in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title: CLEANING_PRICES_META_TITLE,
    description: CLEANING_PRICES_META_TWITTER_DESCRIPTION,
    images: [CLEANING_PRICES_OG_IMAGE],
  },
};

export default async function CleaningPricesCapeTownRoutePage() {
  const bookingHref = marketingHomeBookingHref();
  const { locations } = await getHomePageData();
  const seoLocationLinks = buildHubCleaningServiceLinks(locations);

  return (
    <div className="bg-white text-zinc-900">
      <GrowthTracking
        event="page_view"
        payload={{
          page_type: "cleaning_prices_cape_town",
          content_group: "marketing_pricing",
          primary_kw: "cleaning prices cape town",
        }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <CleaningPricesCapeTownPage seoLocationLinks={seoLocationLinks} />
      </main>
      <MarketingHomeFooter />
    </div>
  );
}
