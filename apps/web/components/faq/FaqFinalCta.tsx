import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";

export function FaqFinalCta() {
  return (
    <section className="border-t border-emerald-950 bg-emerald-950 py-16 text-white" aria-labelledby="faq-final-heading">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
        <h2 id="faq-final-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Still have questions?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-100/95 sm:text-base">
          Our team can clarify scope, timing, or pricing—then you can lock a quote online.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <GetFreeQuoteLink source="faq_footer" variant="onDark" className="w-full max-w-xs sm:w-auto" />
          <a
            href={`mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=Cleaning%20FAQ%20question`}
            className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-emerald-400/90 bg-transparent px-8 text-base font-semibold text-white transition hover:bg-emerald-900/50 sm:w-auto"
          >
            Contact us
          </a>
          <GrowthCtaLink
            href="/book"
            source="faq_footer_book"
            className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-emerald-950 transition hover:bg-emerald-50 sm:w-auto"
          >
            Book a cleaner
          </GrowthCtaLink>
        </div>
      </div>
    </section>
  );
}
