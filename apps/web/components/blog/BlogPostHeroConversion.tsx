import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

type Props = {
  trackingSlug: string;
};

/** Above-the-fold pricing framing + primary booking CTA (DB / marketing blog posts). */
export function BlogPostHeroConversion({ trackingSlug }: Props) {
  const source = `blog_${trackingSlug}_hero_quote`;

  return (
    <div className="not-prose mt-6 flex flex-col gap-4 rounded-2xl border border-blue-100/90 bg-gradient-to-br from-blue-50/90 via-white to-zinc-50/40 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">Get exact pricing for your home</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Pricing preview</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700 sm:text-[0.9375rem]">
          See itemised totals for your bedrooms, bathrooms, and add-ons before you confirm—typical Cape Town home cleans
          often start from around <span className="font-semibold text-zinc-900">R300+</span> for smaller scopes, scaling
          with rooms and service depth.
        </p>
      </div>
      <GrowthCtaLink
        href="/book"
        source={source}
        blogAnalyticsPlacement={`${trackingSlug}_hero_quote`}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Get instant quote
      </GrowthCtaLink>
    </div>
  );
}
