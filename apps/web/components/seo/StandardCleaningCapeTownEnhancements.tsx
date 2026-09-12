import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";

type Props = {
  bookingPath: string;
};

/**
 * Concise pricing-authority handoff for `/services/standard-cleaning-cape-town`.
 *
 * The shared service template owns FAQs and final conversion actions. This
 * extension deliberately avoids duplicating price figures or CTA groups.
 */
export function StandardCleaningCapeTownEnhancements({ bookingPath }: Props) {
  return (
    <section className="border-b border-blue-100 bg-white py-12" aria-labelledby="std-ct-pricing-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="std-ct-pricing-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Standard cleaning prices
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-600">
          Your total is calculated from the current governed pricing rules for bedrooms, bathrooms, selected extras, and
          applicable service charges. Review the{" "}
          <Link
            href={CAPE_TOWN_PRICING_AUTHORITY_HREF}
            className="font-semibold text-blue-700 underline-offset-2 hover:underline"
          >
            current pricing authority
          </Link>{" "}
          or use the quote builder to see the itemised total before checkout.
        </p>
        <div className="mt-6">
          <GrowthCtaLink
            href={bookingPath}
            source="seo_ct_standard-cleaning-cape-town_pricing_quote"
            className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Get instant quote
          </GrowthCtaLink>
        </div>
      </div>
    </section>
  );
}
