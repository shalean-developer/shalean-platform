import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";

export function FaqFinalCta() {
  return (
    <section className="border-t border-blue-950 bg-blue-950 py-16 text-white" aria-labelledby="faq-final-heading">
      <PublicPageContainer className="text-center">
        <h2 id="faq-final-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Still have questions?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-100/95 sm:text-base">
          Our team can clarify scope, timing, or pricing—then you can lock a quote online.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <GetFreeQuoteLink source="faq_footer" variant="onDark" className="w-full max-w-xs sm:w-auto" />
          <a
            href={`mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=Cleaning%20FAQ%20question`}
            className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-[var(--ui-radius-xl)] border border-blue-400/90 bg-transparent px-8 text-base font-semibold text-white transition hover:bg-blue-900/50 sm:w-auto"
          >
            Contact us
          </a>
          <GrowthCtaLink
            href="/book"
            source="faq_footer_book"
            className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-[var(--ui-radius-xl)] bg-white px-8 text-base font-semibold text-blue-950 transition hover:bg-blue-50 sm:w-auto"
          >
            Book a cleaner
          </GrowthCtaLink>
        </div>
      </PublicPageContainer>
    </section>
  );
}
