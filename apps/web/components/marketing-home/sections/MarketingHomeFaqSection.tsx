import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { MarketingHomeFaqAccordion } from "@/components/marketing-home/MarketingHomeFaqAccordion";
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
    <section id="faq" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— FAQs</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12]">
              Cleaning service FAQs
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Straight answers about what&apos;s included, trust, payment, and what to do if something&apos;s not right —
              before you book.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 md:mt-8 md:gap-3">
              <GrowthCtaLink
                href={bookHref}
                source="marketing_faq_book"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
              >
                Book a Cleaner
              </GrowthCtaLink>
              <GrowthCtaLink
                href={bookHref}
                source="marketing_faq_book_arrow"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
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
