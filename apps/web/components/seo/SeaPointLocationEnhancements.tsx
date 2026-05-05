import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import type { SeoLocationAnalyticsBase } from "@/lib/analytics/track";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  ctx: SeoLocationAnalyticsBase;
  /** Instant-quote path (matches location hero CTAs). */
  quoteHref?: string;
};

const STANDARD = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const MOVE_OUT = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;

/** Neighbouring high-intent hubs — passes crawl paths without stuffing keywords. */
const NEARBY_HUB_LINKS = (
  [
    ["claremont-cleaning-services", "Claremont"],
    ["green-point-cleaning-services", "Green Point"],
    ["gardens-cleaning-services", "Gardens"],
    ["durbanville-cleaning-services", "Durbanville"],
  ] as const
).map(([slug, label]) => ({
  label,
  href: LOCATION_SEO_PAGES[slug].path,
}));

/**
 * Location-intent blocks for `/locations/sea-point-cleaning-services` — mirrors money-page depth (trust, snippet pricing, links).
 */
export function SeaPointLocationEnhancements({ ctx, quoteHref = "/booking/details" }: Props) {
  const lc = `${linkEmphasisClassName} font-semibold`;

  return (
    <>
      <section className="border-b border-emerald-100 bg-white py-12" aria-labelledby="sp-trust-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-trust-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Trusted Cleaning Services in Sea Point
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              "Experienced cleaners for apartments & Airbnb units",
              "4,500+ homes cleaned across Cape Town",
              "Reliable service near Sea Point Promenade",
              "Highly rated by local customers",
            ].map((line) => (
              <li
                key={line}
                className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 text-sm leading-relaxed text-zinc-700 shadow-sm"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-emerald-50/30 py-12" aria-labelledby="sp-cost-snippet-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-cost-snippet-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            How much do cleaning services cost in Sea Point Cape Town?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-700">
            Cleaning services in Sea Point typically cost between{" "}
            <strong className="font-semibold text-zinc-900">R300 and R650+</strong>, depending on apartment size and cleaning
            type.
          </p>

          <h3 id="sp-pricing-table-heading" className="mt-10 text-xl font-bold tracking-tight text-zinc-900">
            Typical maintenance-clean bands (Sea Point)
          </h3>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Seaboard lifts, balcony salt film, and turnover pacing stretch times versus inland suburbs—ranges below are typical{" "}
            <strong className="font-medium text-zinc-800">before</strong> ovens, interior fridges, or inventory-grade move-outs.
            Lock your fixed total in the{" "}
            <Link href={quoteHref} className={lc}>
              instant quote
            </Link>
            . Planning a reset heavier than maintenance? Compare{" "}
            <Link href={DEEP} className={lc}>
              deep cleaning services in Cape Town
            </Link>
            , then align bathrooms and add-ons online.
          </p>

          <div className="mt-8 min-h-0 overflow-x-auto rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">Typical Sea Point cleaning price bands by home type</caption>
              <thead>
                <tr className="border-b border-emerald-200 bg-emerald-50/50">
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
              <tbody className="divide-y divide-emerald-100 bg-white">
                <tr>
                  <td className="px-4 py-3 font-medium text-zinc-800">Compact Seaboard apartment (1 bed)</td>
                  <td className="px-4 py-3 text-zinc-700">~R320–R480</td>
                  <td className="px-4 py-3 text-zinc-600">Lifts, salty balconies &amp; compact wet rooms</td>
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-4 py-3 font-medium text-zinc-800">2–3 bed apartment (Main Road / Promenade)</td>
                  <td className="px-4 py-3 text-zinc-700">~R450–R650</td>
                  <td className="px-4 py-3 text-zinc-600">Extra baths &amp; open-plan living add mop cycles</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-zinc-800">Larger sea-facing / dual-balcony</td>
                  <td className="px-4 py-3 text-zinc-700">~R580–R950+</td>
                  <td className="px-4 py-3 text-zinc-600">Airbnb-heavy weeks &amp; humid grease extend dwell time</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <SeoHubGrowthCtaLink
              href={quoteHref}
              source="seo_loc_sea-point-cleaning-services_premium_table_quote"
              ctx={ctx}
              ctaLocation="sea_point_pricing_table"
              ctaLabel="Get instant quote"
              ctaKind="get_price"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:flex-none"
            >
              Get instant quote
            </SeoHubGrowthCtaLink>
            <SeoHubGrowthCtaLink
              href="/booking"
              source="seo_loc_sea-point-cleaning-services_premium_table_book"
              ctx={ctx}
              ctaLocation="sea_point_pricing_table"
              ctaLabel="Book now"
              ctaKind="book_now"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-800 transition hover:bg-emerald-50 sm:flex-none"
            >
              Book now
            </SeoHubGrowthCtaLink>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            Cross-check citywide bands on our{" "}
            <Link href="/cleaning-prices-cape-town" className={lc}>
              Cape Town cleaning prices hub
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-white py-12" aria-labelledby="sp-airbnb-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-airbnb-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Apartments &amp; Airbnb Cleaning in Sea Point
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-700">
            Demand stays high because Airbnb turnovers stack beside resident cleans—same lifts, same loading bays, tighter
            check-in windows. Sea-facing balconies vent salt onto glass and tracks faster than Bowl flats guess, so honest
            bathroom counts beat optimistic square-metre guesses when you need{" "}
            <Link href={STANDARD} className={lc}>
              cleaning services in Cape Town
            </Link>{" "}
            scaled to a Seaboard address.
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-700">
            <li>High-turnover cleaning between short-stay guests</li>
            <li>Apartment stock along Main Road with concierge and basement logistics</li>
            <li>Balcony &amp; sea-facing units where salt air and humidity bond grease</li>
            <li>Host-paced turnovers where linen-ready kitchens matter as much as bathrooms</li>
          </ul>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-emerald-50/25 py-12" aria-labelledby="sp-coverage-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-coverage-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Areas We Cover in Sea Point
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-700">
            <li>Sea Point Promenade corridor</li>
            <li>Main Road apartments</li>
            <li>Beachfront properties</li>
          </ul>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-white py-12" aria-labelledby="sp-choose-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-choose-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            How to choose the best cleaning service in Sea Point
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-700">
            Seaboard buildings punish vague briefs—use this checklist before you compare quotes so crews arrive with enough
            time and the right supplies.
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-700">
            <li>
              <strong className="font-semibold text-zinc-900">Vetted &amp; insured teams</strong> — confirm onboarding and
              accountability before you hand over keys or remotes.
            </li>
            <li>
              <strong className="font-semibold text-zinc-900">Fixed totals vs mystery hourly tabs</strong> — lock bedrooms,
              bathrooms, and add-ons in the{" "}
              <Link href={quoteHref} className={lc}>
                instant quote
              </Link>{" "}
              so checkout matches the visit.
            </li>
            <li>
              <strong className="font-semibold text-zinc-900">Local Sea Point experience</strong> — lifts, visitor discs, and
              salty balconies change pacing; brief parking and balcony scope explicitly.
            </li>
          </ul>
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Ready for metro-wide scope standards? Cross-read{" "}
            <Link href={STANDARD} className={lc}>
              professional cleaning services in Cape Town
            </Link>{" "}
            for what a standard visit typically covers, then tune notes for your Sea Point address.
          </p>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-emerald-50/25 py-12" aria-labelledby="sp-near-hub-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="sp-near-hub-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Cleaning services near you
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Explore neighbouring suburb hubs—each uses the same locked-quote flow with local access notes.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {NEARBY_HUB_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-white py-12" aria-labelledby="sp-links-heading">
        <div className="mx-auto max-w-4xl space-y-5 px-4">
          <h2 id="sp-links-heading" className="sr-only">
            Related cleaning services
          </h2>
          <p className="text-base leading-relaxed text-zinc-700">
            For recurring maintenance after a deeper reset, route ongoing work through{" "}
            <Link href={STANDARD} className={lc}>
              cleaning services in Cape Town
            </Link>{" "}
            (standard home cleaning). Need inventory-grade detail before handover? Book{" "}
            <Link href={MOVE_OUT} className={lc}>
              move out cleaning in Cape Town
            </Link>
            . When kitchens and bathrooms need more than a maintenance pass, compare{" "}
            <Link href={DEEP} className={lc}>
              deep cleaning services in Cape Town
            </Link>{" "}
            before you confirm bedrooms and add-ons.
          </p>
          <p className="text-base leading-relaxed text-zinc-700">
            Hosts and homeowners comparing metro-wide scope often review{" "}
            <Link href={STANDARD} className={lc}>
              professional cleaning services in Cape Town
            </Link>{" "}
            for predictable cadence, then return to this Sea Point hub for suburb-specific access notes—parking pins, remotes,
            and balcony scope still matter on the day.
          </p>
        </div>
      </section>

      <section className="border-b border-emerald-100 bg-zinc-900 py-14 text-white" aria-labelledby="sp-book-heading">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 id="sp-book-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Book a Cleaner in Sea Point Today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-zinc-300">
            Get instant quote · Book in under 60 seconds when slots are open.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SeoHubGrowthCtaLink
              href={quoteHref}
              source="seo_loc_sea-point-cleaning-services_premium_quote"
              ctx={ctx}
              ctaLocation="sea_point_premium_block"
              ctaLabel="Get instant quote"
              ctaKind="get_price"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
            >
              Get instant quote
            </SeoHubGrowthCtaLink>
            <SeoHubGrowthCtaLink
              href="/booking"
              source="seo_loc_sea-point-cleaning-services_premium_book"
              ctx={ctx}
              ctaLocation="sea_point_premium_block"
              ctaLabel="Book now"
              ctaKind="book_now"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-500 px-8 text-base font-semibold text-white transition hover:bg-zinc-800"
            >
              Book now
            </SeoHubGrowthCtaLink>
          </div>
        </div>
      </section>
    </>
  );
}
