import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { MarketingHomeFaqAccordion } from "@/components/marketing-home/MarketingHomeFaqAccordion";
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
    <section id="faq" className="scroll-mt-24 border-t border-slate-100 bg-slate-50 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— FAQs</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Cleaning service FAQs
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-xl text-base leading-relaxed text-slate-600">
              Straight answers about what&apos;s included, trust, payment, and what to do if something&apos;s not right —
              before you book.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
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

        <MarketingHomeFaqAccordion faqs={faqItems} />
      </div>
    </section>
  );
}
