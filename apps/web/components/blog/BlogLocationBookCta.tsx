import { SafeInternalLink } from "@/components/links/SafeInternalLink";

import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { resolveHubFromCleaningServicesCapeTownBlogSlug } from "@/lib/blog/seo/cleaning-services-blog-hub";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { cn } from "@/lib/utils";

const STANDARD_CLEANING_CT = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;

const shell =
  "rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50/90 px-6 py-10 shadow-sm sm:px-8";

type Props = {
  trackingSlug: string;
};

/** Location-aware conversion strip for `cleaning-services-*-cape-town` posts — links hub + booking. */
export function BlogLocationBookCta({ trackingSlug }: Props) {
  const hub = resolveHubFromCleaningServicesCapeTownBlogSlug(trackingSlug);
  if (!hub) return null;

  return (
    <section className={cn("not-prose mt-10", shell)} aria-labelledby="blog-location-book-cta-heading">
      <h2
        id="blog-location-book-cta-heading"
        className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl"
      >
        Book a cleaner in {hub.placeName} today
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
        Trusted, vetted cleaners across Cape Town — same-day slots when capacity allows.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SafeInternalLink
          href={hub.href}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-emerald-300 bg-white px-8 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
        >
          View cleaning services in {hub.placeName}
        </SafeInternalLink>
        <GrowthCtaLink
          href="/booking"
          source={`blog_${trackingSlug}_location_hub_book`}
          blogAnalyticsPlacement={`${trackingSlug}_location_book_cta`}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-emerald-600 px-8 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
        >
          Book now
        </GrowthCtaLink>
      </div>
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-zinc-600">
        For city-wide booking scope and what&apos;s included on maintenance visits, see our guide to{" "}
        <SafeInternalLink href={STANDARD_CLEANING_CT} className="font-semibold text-emerald-800 underline-offset-2 hover:underline">
          cleaning services in Cape Town
        </SafeInternalLink>
        .
      </p>
    </section>
  );
}
