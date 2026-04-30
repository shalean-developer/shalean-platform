import type { Metadata } from "next";
import StructuredData from "@/components/home/StructuredData";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeAboutSection } from "@/components/marketing-home/sections/MarketingHomeAboutSection";
import { MarketingHomeCtaSection } from "@/components/marketing-home/sections/MarketingHomeCtaSection";
import { MarketingHomeFaqSection } from "@/components/marketing-home/sections/MarketingHomeFaqSection";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { MarketingHomeHeroSection } from "@/components/marketing-home/sections/MarketingHomeHeroSection";
import { MarketingHomeHowItWorksSection } from "@/components/marketing-home/sections/MarketingHomeHowItWorksSection";
import { MarketingHomeLocationsSection } from "@/components/marketing-home/sections/MarketingHomeLocationsSection";
import { MarketingHomePopularAreasSection } from "@/components/marketing-home/sections/MarketingHomePopularAreasSection";
import { MarketingHomeServicesSection } from "@/components/marketing-home/sections/MarketingHomeServicesSection";
import { MarketingHomeTrustSection } from "@/components/marketing-home/sections/MarketingHomeTrustSection";
import { getHomePageData } from "@/lib/home/data";
import { getPublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town | Trusted Home Cleaners | Shalean",
  description:
    "Book professional cleaning services in Cape Town. Trusted cleaners, fast booking, and reliable service.",
  alternates: { canonical: "https://www.shalean.co.za" },
  openGraph: {
    type: "website",
    url: "https://www.shalean.co.za",
    title: "Cleaning Services Cape Town | Trusted Home Cleaners | Shalean",
    description:
      "Book professional cleaning services in Cape Town. Trusted cleaners, fast booking, and reliable service.",
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
    description: "Book professional cleaning services in Cape Town. Trusted cleaners, fast booking, and reliable service.",
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
      <StructuredData services={services} locations={locations} faqs={faqs} reviewBanner={reviewBanner} />
      <div className="bg-white text-slate-900">
        <MarketingHomeHeader bookingHref={bookingHref} />
        <main>
          <MarketingHomeHeroSection reviewBanner={reviewBanner} />
          <MarketingHomeTrustSection reviewBanner={reviewBanner} />
          <MarketingHomeServicesSection />
          <MarketingHomeAboutSection />
          <MarketingHomeCtaSection />
          <MarketingHomeHowItWorksSection />
          <MarketingHomeFaqSection faqs={faqs} />
          <MarketingHomeLocationsSection locations={locations} />
          <MarketingHomePopularAreasSection />
        </main>
        <MarketingHomeFooter />
      </div>
    </>
  );
}
