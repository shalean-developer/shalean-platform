import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

export function FaqHero() {
  return (
    <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/70 via-white to-white">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Help centre</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
          Cleaning Service FAQs
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
          Everything you need to know about pricing, services, booking, and what to expect.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <GetFreeQuoteLink source="faq_hero" variant="primary" className="bg-blue-600 hover:bg-blue-700" />
          <GrowthCtaLink
            href="/book"
            source="faq_hero_book"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-600 bg-white px-8 text-base font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50"
          >
            Book a cleaner
          </GrowthCtaLink>
        </div>
      </div>
    </section>
  );
}
