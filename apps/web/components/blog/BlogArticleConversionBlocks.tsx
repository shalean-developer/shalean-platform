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
      className={`${sectionShell} mt-10 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/90 to-white px-6 py-10 text-center shadow-sm`}
      aria-labelledby="blog-end-cta-heading"
    >
      <h2 id="blog-end-cta-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
        Need help? Book a professional cleaning service
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-600">
        Tell us your Cape Town address and home details—pricing updates before you confirm, with vetted Shalean teams.
      </p>
      <GrowthCtaLink
        href="/booking/details"
        source={`blog_${trackingSlug}_end_cta_book`}
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Book cleaning online
      </GrowthCtaLink>
    </section>
  );
}
