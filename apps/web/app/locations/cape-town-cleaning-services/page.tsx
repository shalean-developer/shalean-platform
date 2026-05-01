import type { Metadata } from "next";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
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
import { marketingHeroImage } from "@/lib/marketing/marketingHomeAssets";

const SITE = "https://www.shalean.co.za";
const PATH = "/locations/cape-town-cleaning-services";
const OG = marketingHeroImage("cape-town-house-cleaning-kitchen.webp");

export const metadata: Metadata = {
  title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
  description:
    "Book reliable cleaning services in Cape Town. Trusted cleaners, flexible scheduling, and instant quotes for homes, apartments, and Airbnb properties.",
  alternates: { canonical: `${SITE}${PATH}` },
  openGraph: {
    type: "website",
    url: `${SITE}${PATH}`,
    title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
    description:
      "Book reliable cleaning services in Cape Town. Trusted cleaners, flexible scheduling, and instant quotes for homes, apartments, and Airbnb properties.",
    images: [{ url: OG, width: 1024, height: 576, alt: "Home cleaning services in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Services Cape Town | Book Trusted Cleaners | Shalean",
    description:
      "Book reliable cleaning services in Cape Town. Trusted cleaners, flexible scheduling, and instant quotes for homes, apartments, and Airbnb properties.",
    images: [OG],
  },
};

export default function CapeTownCleaningServicesPage() {
  return (
    <MarketingLayout>
      <main className="bg-zinc-50/80 pb-20 pt-8 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl space-y-16 px-4">
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
        </div>
      </main>
    </MarketingLayout>
  );
}
