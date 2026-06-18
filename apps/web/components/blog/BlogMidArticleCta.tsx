import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

type Props = {
  trackingSlug: string;
};

/** Mid-page booking prompt after service discovery sections. */
export function BlogMidArticleCta({ trackingSlug }: Props) {
  return (
    <aside
      className="not-prose rounded-2xl border border-zinc-200 bg-zinc-900 px-6 py-8 text-center shadow-lg sm:px-8"
      aria-labelledby="blog-mid-cta-heading"
    >
      <h2 id="blog-mid-cta-heading" className="text-lg font-bold tracking-tight text-white sm:text-xl">
        Still unsure which service you need?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
        Get instant pricing based on your home size—bedrooms, bathrooms, add-ons—before you pick a slot.
      </p>
      <GrowthCtaLink
        href="/book"
        source={`blog_${trackingSlug}_mid_cta`}
        blogAnalyticsPlacement={`${trackingSlug}_mid_cta`}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
      >
        Check pricing &amp; availability
      </GrowthCtaLink>
    </aside>
  );
}
