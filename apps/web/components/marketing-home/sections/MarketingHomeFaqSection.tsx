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
      className="scroll-mt-24 border-t border-border bg-background md:py-[var(--ui-space-24)]"
    >
      <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-[var(--ui-space-20)]">
        <div className="lg:sticky lg:top-28">
          <MarketingSectionHeader
            align="left"
            eyebrow="FAQ"
            title="Questions before you book?"
            description="Straight answers about what is included, payment, trust and what to expect from your booking."
          />
        </div>

        <div>
          <MarketingHomeFaqAccordion faqs={faqItems} />
        </div>
      </div>
    </HomeSection>
  );
}
