import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { STANDARD_CLEANING_SNIPPET_FAQS } from "@/lib/seo/standardCleaningMoneyPageFaqs";

type Props = {
  bookingPath: string;
};

/**
 * Pricing, snippet FAQs, and mid-page CTAs for `/services/standard-cleaning-cape-town` only.
 */
export function StandardCleaningCapeTownEnhancements({ bookingPath }: Props) {
  return (
    <>
      <section className="border-b border-blue-100 bg-white py-14" aria-labelledby="std-ct-prices-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="std-ct-prices-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Cleaning services prices in Cape Town
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Maintenance cleaning totals depend on bedrooms, bathrooms, and add-ons—ranges below are typical standard scopes
            before extras. Lock your fixed total in the{" "}
            <Link href={bookingPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              instant quote
            </Link>
            .
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-blue-100 bg-blue-50/40 shadow-sm">
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">Typical standard cleaning price bands in Cape Town</caption>
              <thead>
                <tr className="border-b border-blue-200 bg-white">
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Home type
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Typical visit band
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 bg-white">
                <tr>
                  <td className="px-4 py-3 font-medium text-zinc-800">Compact apartment (1 bed)</td>
                  <td className="px-4 py-3 text-zinc-700">From ~R250–R380</td>
                  <td className="px-4 py-3 text-zinc-600">Ideal for weekly or bi-weekly upkeep</td>
                </tr>
                <tr className="bg-blue-50/50">
                  <td className="px-4 py-3 font-medium text-zinc-800">2–3 bed apartment / townhouse</td>
                  <td className="px-4 py-3 text-zinc-700">~R350–R520</td>
                  <td className="px-4 py-3 text-zinc-600">Extra bathrooms &amp; ovens shift time upward</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-zinc-800">Family house (larger footprint)</td>
                  <td className="px-4 py-3 text-zinc-700">~R450–R600+</td>
                  <td className="px-4 py-3 text-zinc-600">Scope scales with rooms &amp; furnished density</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_standard-cleaning-cape-town_after_table_quote"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:flex-none"
            >
              Get instant quote
            </GrowthCtaLink>
            <GrowthCtaLink
              href="/booking"
              source="seo_ct_standard-cleaning-cape-town_after_table_book"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-blue-200 bg-white px-6 text-base font-semibold text-blue-800 transition hover:bg-blue-50 sm:flex-none"
            >
              Book now
            </GrowthCtaLink>
          </div>

          <section id="faqs" className="scroll-mt-24 mt-12 border-t border-blue-100 pt-12" aria-labelledby="std-ct-faq-heading">
            <h2 id="std-ct-faq-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-5">
              {STANDARD_CLEANING_SNIPPET_FAQS.map((faq) => (
                <div key={faq.q} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
                  <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-10 text-sm leading-relaxed text-zinc-600">
            Apartment vs house pricing nuances — plus deep-clean uplifts — are spelled out in our{" "}
            <Link href="/cleaning-prices-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              cleaning prices hub
            </Link>{" "}
            and{" "}
            <Link href="/blog/how-much-does-cleaning-cost-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Cape Town cleaning cost guide
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/30 py-14" aria-labelledby="std-ct-book-heading">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 id="std-ct-book-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Book a cleaner in Cape Town today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-zinc-600">
            Same-day and next-day slots when routing allows — pick rooms, see your total, and confirm online.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_standard-cleaning-cape-town_mid_cta"
              className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Get instant quote
            </GrowthCtaLink>
            <GrowthCtaLink
              href="/booking"
              source="seo_ct_standard-cleaning-cape-town_mid_book"
              className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 bg-white px-8 text-base font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Book a cleaner
            </GrowthCtaLink>
          </div>
        </div>
      </section>
    </>
  );
}
