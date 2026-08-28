import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { MarketingHomeFaqAccordion } from "@/components/marketing-home/MarketingHomeFaqAccordion";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import type { HomeFaq } from "@/lib/home/data";
import { MARKETING_HOME_DEFAULT_FAQS } from "@/lib/marketing/marketingHomeFaqs";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

type Props = {
  faqs: HomeFaq[];
};

/** FAQ intro (server) + accordion (client island). */
export function MarketingHomeFaqSection({ faqs }: Props) {
  const faqItems = faqs.length > 0 ? faqs : MARKETING_HOME_DEFAULT_FAQS;
  const bookHref = marketingHomeBookingHref();

  return (
    <HomeSection id="faq" tone="muted" className="scroll-mt-24 border-t border-border">
      <div className="grid gap-[var(--ui-space-8)] lg:grid-cols-2 lg:items-start lg:gap-[var(--ui-space-12)]">
        <HomeSectionHeader eyebrow="FAQs" title="Cleaning service FAQs" />

        <div>
          <p className="max-w-xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Straight answers about what&apos;s included, trust, payment, and what to do if something&apos;s not right —
            before you book.
          </p>
          <div className="mt-[var(--ui-space-6)] flex flex-wrap items-center gap-[var(--ui-space-3)]">
            <GrowthCtaLink href={bookHref} source="marketing_faq_book" className={marketingPrimaryCtaClassName}>
              Book a cleaner
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookHref}
              source="marketing_faq_book_arrow"
              className={marketingPrimaryCtaIconClassName}
            >
              <span className="sr-only">Book a cleaner</span>
              <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
            </GrowthCtaLink>
          </div>
        </div>
      </div>

      <div className="mt-[var(--ui-space-10)]">
        <MarketingHomeFaqAccordion faqs={faqItems} />
      </div>
    </HomeSection>
  );
}
