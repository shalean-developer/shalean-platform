import type { Metadata } from "next";
import Link from "next/link";
import StructuredData from "@/components/home/StructuredData";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeAboutSection } from "@/components/marketing-home/sections/MarketingHomeAboutSection";
import { MarketingHomeCtaSection } from "@/components/marketing-home/sections/MarketingHomeCtaSection";
import { MarketingHomeFaqSection } from "@/components/marketing-home/sections/MarketingHomeFaqSection";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { MarketingStickyTrustBadge } from "@/components/marketing-home/MarketingStickyTrustBadge";
import { MarketingGoogleReviewsBand } from "@/components/marketing-home/sections/MarketingGoogleReviewsBand";
import { MarketingHomeHeroSection } from "@/components/marketing-home/sections/MarketingHomeHeroSection";
import { MarketingHomeHowItWorksSection } from "@/components/marketing-home/sections/MarketingHomeHowItWorksSection";
import { MarketingAreasSection } from "@/components/marketing-home/sections/MarketingAreasSection";
import { MarketingHomeServicesSection } from "@/components/marketing-home/sections/MarketingHomeServicesSection";
import { MarketingHomeTrustSection } from "@/components/marketing-home/sections/MarketingHomeTrustSection";
import { getHomePageData } from "@/lib/home/data";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { getHomepageInternalSeoLinks } from "@/lib/seo/capeTownSeoPages";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";
const HOME_CANONICAL = absoluteCanonicalUrl("/");
const HOME_META_DESCRIPTION = clampMetaDescription(
  "Book professional cleaning services in Cape Town. Trusted cleaners, fast booking, and reliable service.",
);

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town | Trusted Home Cleaners | Shalean",
  description: HOME_META_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: HOME_CANONICAL },
  openGraph: {
    type: "website",
    url: HOME_CANONICAL,
    title: "Cleaning Services Cape Town | Trusted Home Cleaners | Shalean",
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
    title: "Cleaning Services Cape Town | Trusted Home Cleaners | Shalean",
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
      <nav className="sr-only" aria-label="Cape Town service and suburb pages">
        <ul>
          {getHomepageInternalSeoLinks().map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="bg-white text-slate-900">
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main>
          <MarketingHomeHeroSection reviewBanner={reviewBanner} />
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
