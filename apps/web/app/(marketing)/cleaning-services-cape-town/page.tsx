import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { BlogLinks } from "@/components/locations/cape-town-cleaning-services/BlogLinks";
import { FAQSection } from "@/components/locations/cape-town-cleaning-services/FAQSection";
import { FinalCTA } from "@/components/locations/cape-town-cleaning-services/FinalCTA";
import { HeroSection } from "@/components/locations/cape-town-cleaning-services/HeroSection";
import { LocationsGrid } from "@/components/locations/cape-town-cleaning-services/LocationsGrid";
import { PricingPreview } from "@/components/locations/cape-town-cleaning-services/PricingPreview";
import { QuickAnswer } from "@/components/locations/cape-town-cleaning-services/QuickAnswer";
import { ServicesGrid } from "@/components/locations/cape-town-cleaning-services/ServicesGrid";
import { TrustBar } from "@/components/locations/cape-town-cleaning-services/TrustBar";
import { WhyChooseUs } from "@/components/locations/cape-town-cleaning-services/WhyChooseUs";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { marketingHeroImage } from "@/lib/marketing/marketingHomeAssets";
import {
  CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION,
  CLEANING_SERVICES_CAPE_TOWN_HUB_PATH,
  cleaningServicesCapeTownHubJsonLdScriptContent,
} from "@/lib/seo/cleaningServicesCapeTownHub";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const CANONICAL_ABSOLUTE = absoluteCanonicalUrl(CLEANING_SERVICES_CAPE_TOWN_HUB_PATH);
const OG = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
  description: CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL_ABSOLUTE },
  openGraph: {
    type: "website",
    url: CANONICAL_ABSOLUTE,
    title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
    description: CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION,
    images: [{ url: OG, width: 1024, height: 576, alt: "Home cleaning services in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
    description: CLEANING_SERVICES_CAPE_TOWN_HUB_DESCRIPTION,
    images: [OG],
  },
};

export default function CleaningServicesCapeTownPage() {
  const hubJsonLd = cleaningServicesCapeTownHubJsonLdScriptContent();
  return (
    <MarketingLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: hubJsonLd }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{
          page_type: "cleaning_services_cape_town",
          content_group: "marketing_city_hub",
          primary_kw: "cleaning services cape town",
        }}
      />
      <main className="bg-background text-foreground">
        <PublicPageContainer size="wide" className="space-y-16 pb-20 pt-8">
          <HeroSection />
          <TrustBar />
          <QuickAnswer />
          <ServicesGrid />
          <LocationsGrid />
          <PricingPreview />
          <WhyChooseUs />
          <BlogLinks />
          <FAQSection />
          <FinalCTA />
        </PublicPageContainer>
      </main>
    </MarketingLayout>
  );
}
