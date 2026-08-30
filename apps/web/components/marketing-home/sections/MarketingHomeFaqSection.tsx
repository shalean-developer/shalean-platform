import { MarketingHomeFaqAccordion } from "@/components/marketing-home/MarketingHomeFaqAccordion";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import type { HomeFaq } from "@/lib/home/data";
import { MARKETING_HOME_DEFAULT_FAQS } from "@/lib/marketing/marketingHomeFaqs";

type Props = {
  faqs: HomeFaq[];
};

/** FAQ intro (server) + accordion (client island). */
export function MarketingHomeFaqSection({ faqs }: Props) {
  const faqItems = faqs.length > 0 ? faqs : MARKETING_HOME_DEFAULT_FAQS;

  return (
    <HomeSection
      id="faq"
      containerSize="marketing"
      className="scroll-mt-24 border-t border-border bg-background md:py-[var(--ui-space-20)]"
    >
      <MarketingSectionHeader
        eyebrow="FAQ"
        title="Questions before you book?"
        description="Straight answers about what is included, payment, trust and what to expect from your booking."
      />

      <div className="mx-auto mt-[var(--ui-space-12)] max-w-5xl">
        <MarketingHomeFaqAccordion faqs={faqItems} />
      </div>
    </HomeSection>
  );
}
