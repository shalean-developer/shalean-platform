import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

const sectionShell = "not-prose";

type EndCtaProps = {
  /** Post slug for `GrowthCtaLink` `source` (e.g. editorial or programmatic slug). */
  trackingSlug: string;
};

/** Primary end-of-article conversion block — appears on every blog article. */
export function BlogArticleEndCta({ trackingSlug }: EndCtaProps) {
  return (
    <section
      className={`${sectionShell} mt-10 rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 px-6 py-12 text-center shadow-lg shadow-blue-600/25 sm:px-10`}
      aria-labelledby="blog-end-cta-heading"
    >
      <h2 id="blog-end-cta-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Get your cleaning quote in Cape Town
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-blue-100 sm:text-base">
        See exact pricing and book online in minutes—your total stays tied to the rooms and tier you select.
      </p>
      <GrowthCtaLink
        href="/booking/details"
        source={`blog_${trackingSlug}_end_cta_book`}
        blogAnalyticsPlacement={`${trackingSlug}_end_cta`}
        className="mt-8 inline-flex min-h-[52px] min-w-[220px] items-center justify-center rounded-full bg-white px-10 text-base font-semibold text-blue-700 shadow-md transition hover:bg-blue-50"
      >
        Get instant quote
      </GrowthCtaLink>
      <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-blue-200/90">
        Same-day slots when capacity allows · Deep, standard, move-out &amp; Airbnb
      </p>
    </section>
  );
}
