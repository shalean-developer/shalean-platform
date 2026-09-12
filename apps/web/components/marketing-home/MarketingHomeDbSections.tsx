import StructuredData from "@/components/home/StructuredData";
import { MarketingHomeCoreServicesSection } from "@/components/marketing-home/sections/MarketingHomeCoreServicesSection";
import { MarketingAreasSection } from "@/components/marketing-home/sections/MarketingAreasSection";
import { MarketingHomeFaqSection } from "@/components/marketing-home/sections/MarketingHomeFaqSection";
import { MarketingHomeHowItWorksSection } from "@/components/marketing-home/sections/MarketingHomeHowItWorksSection";
import { MarketingHomeServicesSection } from "@/components/marketing-home/sections/MarketingHomeServicesSection";
import { MarketingHomeTrustSection } from "@/components/marketing-home/sections/MarketingHomeTrustSection";
import { PromotionFeaturedCard } from "@/components/promotions/PromotionFeaturedCard";
import { getMarketingHomeSeoData } from "@/lib/home/data";
import { MARKETING_HOME_DEFAULT_FAQS } from "@/lib/marketing/marketingHomeFaqs";
import { buildMarketingHomeServiceCards } from "@/lib/marketing/marketingHomeServicePresentation";

/** CMS-backed services and areas plus governed homepage FAQ + JSON-LD content. */
export async function MarketingHomeDbSections() {
  const { services, locations } = await getMarketingHomeSeoData();
  const serviceCards = buildMarketingHomeServiceCards(services);
  // Keep `/` focused on broad booking/company questions. Service-specific FAQ intent belongs on service pages.
  const resolvedFaqs = MARKETING_HOME_DEFAULT_FAQS;

  return (
    <>
      <StructuredData services={services} locations={locations} faqs={resolvedFaqs} />
      <MarketingHomeCoreServicesSection cards={serviceCards} />
      <PromotionFeaturedCard />
      <MarketingHomeHowItWorksSection />
      <MarketingHomeTrustSection />
      <MarketingHomeServicesSection />
      <MarketingAreasSection />
      <MarketingHomeFaqSection faqs={resolvedFaqs} />
    </>
  );
}
