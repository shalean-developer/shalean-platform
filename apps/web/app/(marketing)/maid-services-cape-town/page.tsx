import type { Metadata } from "next";
import { MaidServicesCapeTownPage } from "@/components/marketing-maid/MaidServicesCapeTownPage";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { getHomePageData } from "@/lib/home/data";
import { buildHubCleaningServiceLinks } from "@/lib/marketing/hubCleaningServiceLinks";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import {
  MAID_SERVICES_META_DESCRIPTION,
  MAID_SERVICES_META_TITLE,
  MAID_SERVICES_OG_IMAGE,
  maidServicesHubCanonicalUrl,
} from "@/lib/seo/marketingMaidServicesHubMeta";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const CANONICAL = maidServicesHubCanonicalUrl();

export const metadata: Metadata = {
  title: MAID_SERVICES_META_TITLE,
  description: MAID_SERVICES_META_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: MAID_SERVICES_META_TITLE,
    description: MAID_SERVICES_META_DESCRIPTION,
    images: [{ url: MAID_SERVICES_OG_IMAGE, alt: "Professional home cleaning in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title: MAID_SERVICES_META_TITLE,
    description: MAID_SERVICES_META_DESCRIPTION,
    images: [MAID_SERVICES_OG_IMAGE],
  },
};

export default async function MaidServicesCapeTownRoutePage() {
  const bookingHref = marketingHomeBookingHref();
  const { locations } = await getHomePageData();
  const seoLocationLinks = buildHubCleaningServiceLinks(locations);

  return (
    <div className="bg-white text-zinc-900">
      <GrowthTracking
        event="page_view"
        payload={{
          page_type: "maid_services_cape_town",
          content_group: "marketing_maid",
          primary_kw: "maid services cape town",
        }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <MaidServicesCapeTownPage seoLocationLinks={seoLocationLinks} />
      </main>
      <MarketingHomeFooter />
    </div>
  );
}
