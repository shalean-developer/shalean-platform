import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { HubContentTier } from "@/lib/seo/location-priority";
import { getLocationPricingHeroLine } from "@/lib/seo/location-pricing";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import type { SeoLocationAnalyticsBase } from "@/lib/analytics/track";

type Props = {
  location: CapeTownLocationRow;
  slug: string;
  tier: HubContentTier;
  analyticsCtx: SeoLocationAnalyticsBase;
};

/** Mid-scroll commercial strip — omitted on lowest tier to avoid thin-page noise. */
export function LocationHubMidBanner({ location, slug, tier, analyticsCtx }: Props) {
  if (tier === "base") return null;

  const { name } = location;
  const pricing = getLocationPricingHeroLine(location);

  return (
    <section className="border-y border-emerald-100 bg-emerald-50/50 py-12" aria-label={`Book cleaning in ${name}`}>
      <div className="mx-auto max-w-4xl px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Availability &amp; pricing</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
          Lock your {name} quote before we dispatch
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-700">
          Typical scopes in {name} start around <span className="font-semibold text-zinc-900">{pricing}</span>. Same-week
          slots appear when routing allows—open the flow to see live times for your street.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <SeoHubGrowthCtaLink
            href="/booking/details"
            source={`seo_loc_${slug}_mid_banner`}
            ctx={analyticsCtx}
            ctaLocation="pricing"
            ctaLabel={`Check slots & total for ${name}`}
            ctaKind="get_price"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Check slots &amp; total for {name}
          </SeoHubGrowthCtaLink>
          <SeoHubGrowthCtaLink
            href="/booking/details"
            source={`seo_loc_${slug}_mid_banner_quick`}
            ctx={analyticsCtx}
            ctaLocation="pricing"
            ctaLabel="Quick book"
            ctaKind="book_now"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-900 transition hover:bg-emerald-50"
          >
            Quick book
          </SeoHubGrowthCtaLink>
        </div>
      </div>
    </section>
  );
}
