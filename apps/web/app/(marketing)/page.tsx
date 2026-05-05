import type { Metadata } from "next";
import StructuredData from "@/components/home/StructuredData";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeAboutSection } from "@/components/marketing-home/sections/MarketingHomeAboutSection";
import { MarketingHomeCtaSection } from "@/components/marketing-home/sections/MarketingHomeCtaSection";
import { MarketingHomeFaqSection } from "@/components/marketing-home/sections/MarketingHomeFaqSection";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { MarketingStickyTrustBadge } from "@/components/marketing-home/MarketingStickyTrustBadge";
import { MarketingGoogleReviewsBand } from "@/components/marketing-home/sections/MarketingGoogleReviewsBand";
import { MarketingHomeCoreServicesSection } from "@/components/marketing-home/sections/MarketingHomeCoreServicesSection";
import { MarketingHomeHeroSection } from "@/components/marketing-home/sections/MarketingHomeHeroSection";
import { MarketingHomeHowItWorksSection } from "@/components/marketing-home/sections/MarketingHomeHowItWorksSection";
import { MarketingAreasSection } from "@/components/marketing-home/sections/MarketingAreasSection";
import { MarketingHomeServicesSection } from "@/components/marketing-home/sections/MarketingHomeServicesSection";
import { MarketingHomeTrustSection } from "@/components/marketing-home/sections/MarketingHomeTrustSection";
import { getHomePageData } from "@/lib/home/data";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";
const HOME_CANONICAL = absoluteCanonicalUrl("/");
const HOME_META_DESCRIPTION = clampMetaDescription(
  "Book trusted cleaning services in Cape Town. Affordable prices, same-day availability when routing allows, and vetted cleaners. Get a quote in under a minute.",
);

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town from R250 | Same-Day Booking | Shalean",
  description: HOME_META_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: HOME_CANONICAL },
  openGraph: {
    type: "website",
    url: HOME_CANONICAL,
    title: "Cleaning Services Cape Town from R250 | Same-Day Booking | Shalean",
    description: HOME_META_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1024,
        height: 576,
        alt: "Professional cleaning services in Cape Town",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Cape Town from R250 | Same-Day Booking | Shalean",
    description: HOME_META_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default async function MarketingHomePage() {
  const [{ services, locations, faqs }, reviewBanner] = await Promise.all([
    getHomePageData(),
    getPublicReviewBannerStats(),
  ]);

  const bookingHref = marketingHomeBookingHref();

  return (
    <>
      <StructuredData services={services} locations={locations} faqs={faqs} />
      <div className="bg-white text-slate-900">
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main>
          <MarketingHomeHeroSection reviewBanner={reviewBanner} />
          <MarketingHomeCoreServicesSection />
          <MarketingHomeTrustSection />
          <MarketingGoogleReviewsBand />
          <MarketingHomeServicesSection />
          <MarketingHomeAboutSection />
          <MarketingHomeCtaSection />
          <MarketingHomeHowItWorksSection />
          <MarketingHomeFaqSection faqs={faqs} />
          <MarketingAreasSection locations={locations} />
        </main>
        <MarketingHomeFooter />
        <MarketingStickyTrustBadge />
      </div>
    </>
  );
}
