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

/** CMS-backed services, FAQ, areas, and JSON-LD — streamed after the hero. */
export async function MarketingHomeDbSections() {
  const { services, locations, faqs } = await getMarketingHomeSeoData();
  const serviceCards = buildMarketingHomeServiceCards(services);
  const resolvedFaqs = faqs.length > 0 ? faqs : MARKETING_HOME_DEFAULT_FAQS;

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
