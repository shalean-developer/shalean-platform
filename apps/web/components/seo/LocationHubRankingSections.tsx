import Link from "next/link";
import { AlertTriangle, BadgeCheck, Scale, ShieldCheck } from "lucide-react";
import { getEditorialClusterBlogLinksForHub, getHubEditorialGuideLinks } from "@/lib/blog/programmaticPosts";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { directAnswerHowMuchDoesCleaningCost } from "@/lib/seo/location-featured-snippet-copy";
import { getStructuredPricingForLocation } from "@/lib/seo/location-pricing-structured";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import type { SeoLocationAnalyticsBase } from "@/lib/analytics/track";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import { hubContentRefreshCadenceNote, hubOptionalContentReviewLine } from "@/lib/seo/location-hub-content-cycle";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  location: CapeTownLocationRow;
  slug: string;
  analyticsCtx: SeoLocationAnalyticsBase;
};

/**
 * Comparison intent, structured pricing (snippet-oriented), and objection handling — programmatic hubs only.
 */
export function LocationHubRankingSections({ location, slug, analyticsCtx }: Props) {
  const { name, city } = location;
  const structured = getStructuredPricingForLocation(location);
  const deepPath = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const standardPath = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const moveOutPath = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const guideLinks = getHubEditorialGuideLinks(slug, name);
  const allClusterBlogLinks = getEditorialClusterBlogLinksForHub(slug, name);
  const extraBlogLinks = allClusterBlogLinks.filter((l) => !guideLinks.some((g) => g.href === l.href));
  const freshnessLabel = new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());
  const optionalReviewLine = hubOptionalContentReviewLine();

  return (
    <>
      <section
        className="border-b border-zinc-100 bg-white py-16"
        aria-labelledby="hub-choose-cleaning-heading"
      >
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-choose-cleaning-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            How to choose the best cleaning service in {name}
          </h2>
          <div className="mt-8 space-y-8">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6">
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Pricing transparency</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                    Strong {name} providers itemise bedrooms, bathrooms, and add-ons before dispatch—not vague “per hour”
                    guesses that change on arrival. Use Shalean’s booking flow to lock a total for your {city} address,
                    then compare that quote against{" "}
                    <Link href={standardPath} className={linkEmphasisClassName}>
                      standard cleaning guidance
                    </Link>{" "}
                    and{" "}
                    <Link href={deepPath} className={linkEmphasisClassName}>
                      deep cleaning scope
                    </Link>{" "}
                    so expectations match the checklist you confirmed.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-zinc-700" aria-hidden />
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Trust signals that matter locally</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
                    <li>
                      Public review volume on Google ({GOOGLE_BUSINESS_REVIEWS.rating}★, {GOOGLE_BUSINESS_REVIEWS.count}+
                      reviews) alongside predictable Cape Town routing.
                    </li>
                    <li>Vetted teams with insurance—not informal cash-only operators without recourse.</li>
                    <li>Written scope alignment before cleaners enter lifts, parking bays, or estate gates in {name}.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" aria-hidden />
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">What to avoid</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
                    <li>Quotes that skip bathroom counts or oven/fridge add-ons when you know you need them.</li>
                    <li>Operators who cannot explain what happens if something is missed after handover.</li>
                    <li>Last-minute scope creep without updating your locked total—always confirm changes in writing.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-8 text-center">
            <SeoHubGrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_choose_compare`}
              ctx={analyticsCtx}
              ctaLocation="compare_section"
              ctaLabel={`Compare & book — ${name}`}
              ctaKind="compare"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Compare & book — {name}
            </SeoHubGrowthCtaLink>
          </p>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-12" aria-labelledby="hub-planner-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-planner-heading" className="text-lg font-bold tracking-tight text-zinc-900">
            Planning shortcuts for {name}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Expand a topic to compare tiers and booking mechanics—each block links back to city-wide service guides.
          </p>
          <div className="mt-5 space-y-3">
            <details className="group rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm open:border-emerald-200">
              <summary className="cursor-pointer list-none font-semibold text-zinc-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Standard vs deep cleaning
                  <span className="text-zinc-400 transition group-open:rotate-180" aria-hidden>
                    ▾
                  </span>
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-zinc-700">
                Standard visits maintain kitchens and bathrooms between resets; deep cleans budget extra dwell on grout-adjacent zones, ovens, and detail dust-downs. Compare{" "}
                <Link href={standardPath} className={linkEmphasisClassName}>
                  standard cleaning ({city})
                </Link>{" "}
                and{" "}
                <Link href={deepPath} className={linkEmphasisClassName}>
                  deep cleaning ({city})
                </Link>{" "}
                before you lock rooms online.
              </p>
            </details>
            <details className="group rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm open:border-emerald-200">
              <summary className="cursor-pointer list-none font-semibold text-zinc-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Move-outs &amp; deposits
                  <span className="text-zinc-400 transition group-open:rotate-180" aria-hidden>
                    ▾
                  </span>
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-zinc-700">
                Inventory photography cares about wet areas, edges, and appliance interiors you explicitly select. Open{" "}
                <Link href={moveOutPath} className={linkEmphasisClassName}>
                  move-out cleaning ({city})
                </Link>{" "}
                for scope language, then align booking notes with your agent checklist.
              </p>
            </details>
            <details className="group rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm open:border-emerald-200">
              <summary className="cursor-pointer list-none font-semibold text-zinc-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Why quotes lock before payment
                  <span className="text-zinc-400 transition group-open:rotate-180" aria-hidden>
                    ▾
                  </span>
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-zinc-700">
                Itemised totals remove guesswork—bedrooms, bathrooms, tier, and add-ons set the number you approve before we dispatch to {name}. Adjust selections until the quote matches your visit, then confirm when it feels right.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16" aria-labelledby="hub-pricing-table-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-pricing-table-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Cleaning prices in {name} by home type
          </h2>
          <p className="mt-2 text-xs font-medium text-zinc-500">Last updated: {freshnessLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{hubContentRefreshCadenceNote()}</p>
          {optionalReviewLine ? (
            <p className="mt-1 text-xs font-medium text-zinc-600">{optionalReviewLine}</p>
          ) : null}
          <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-base font-medium leading-relaxed text-zinc-800">
            {directAnswerHowMuchDoesCleaningCost(location)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Illustrative ZAR ranges for planning—not a binding quote. Your total is calculated from rooms, bathrooms,
            service tier, and add-ons at checkout.
          </p>
          <div className="not-prose mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Base scope</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">Tier + rooms</p>
              <p className="mt-1 text-xs leading-snug text-zinc-600">
                Standard, deep, Airbnb, or move-out sets the baseline hours before add-ons.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Wet zones</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">Baths &amp; kitchens</p>
              <p className="mt-1 text-xs leading-snug text-zinc-600">
                Extra bathrooms or heavy stoves move quotes faster than an occasional spare bedroom.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add-ons</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">Appliances &amp; extras</p>
              <p className="mt-1 text-xs leading-snug text-zinc-600">
                Ovens, fridges, balconies, or carpet bundles—only pay for what you tick at checkout.
              </p>
            </div>
          </div>
          {guideLinks.length > 0 ? (
            <p className="mt-6 text-sm leading-relaxed text-zinc-700">
              <span className="font-semibold text-zinc-900">Four planning guides for {name}: </span>
              {guideLinks.map((item, i) => (
                <span key={item.href}>
                  {i > 0 ? (i === guideLinks.length - 1 ? ", and " : ", ") : null}
                  <Link href={item.href} className={`font-medium ${linkEmphasisClassName}`}>
                    {item.label}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
          {extraBlogLinks.length > 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-700">
              <span className="font-semibold text-zinc-900">Area service blogs: </span>
              {extraBlogLinks.map((item, i) => (
                <span key={item.href}>
                  {i > 0 ? (i === extraBlogLinks.length - 1 ? ", and " : ", ") : null}
                  <Link href={item.href} className={`font-medium ${linkEmphasisClassName}`}>
                    {item.label}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
          <p className="mt-4 text-sm leading-relaxed text-zinc-700">
            <span className="font-semibold text-zinc-900">City-wide service pages: </span>
            <Link href={deepPath} className={`font-medium ${linkEmphasisClassName}`}>
              Deep cleaning ({city})
            </Link>
            ,{" "}
            <Link href={standardPath} className={`font-medium ${linkEmphasisClassName}`}>
              Standard cleaning ({city})
            </Link>
            ,{" "}
            <Link href={moveOutPath} className={`font-medium ${linkEmphasisClassName}`}>
              Move-out cleaning ({city})
            </Link>
            .
          </p>
          {guideLinks.length === 0 && extraBlogLinks.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Book{" "}
              <Link href={deepPath} className={`font-medium ${linkEmphasisClassName}`}>
                deep cleaning in {city}
              </Link>{" "}
              or{" "}
              <Link href={standardPath} className={`font-medium ${linkEmphasisClassName}`}>
                standard cleaning
              </Link>
              —then lock totals for your {name} address.
            </p>
          ) : null}
          <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <caption className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium text-zinc-800">
                {structured.caption}
              </caption>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100/90">
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Home type
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Standard cleaning (typical)
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                    Deep cleaning (typical)
                  </th>
                </tr>
              </thead>
              <tbody>
                {structured.rows.map((row) => (
                  <tr key={row.homeType} className="border-b border-zinc-100 bg-white last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-medium text-zinc-900">
                      {row.homeType}
                    </th>
                    <td className="px-4 py-3 text-zinc-700">{row.standardCleaning}</td>
                    <td className="px-4 py-3 text-zinc-700">{row.deepCleaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/90 p-5 text-sm text-zinc-800 open:bg-white">
            <summary className="cursor-pointer text-base font-semibold text-zinc-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden">
              What affects price?
            </summary>
            <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-zinc-700">
              <li>
                <span className="font-medium text-zinc-900">Rooms &amp; wet zones — </span>
                bedroom and bathroom counts move crew time faster than postcode alone.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Service tier — </span>
                deep cleans and move-out scopes include heavier kitchens, bathrooms, and detail zones than maintenance
                standard visits.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Add-ons — </span>
                ovens, fridges, interior cupboards, and carpet or balcony scope change totals once itemised.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Access &amp; parking — </span>
                lifts, boom gates, or tight bays in {name} should be noted so booked hours target cleaning—not circling
                blocks.
              </li>
            </ul>
          </details>
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:items-center">
            <SeoHubGrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_pricing_quote_teaser`}
              ctx={analyticsCtx}
              ctaLocation="pricing"
              ctaLabel="Get exact quote"
              ctaKind="get_price"
              pricingInteraction={{ interaction: "get_exact_price_click", label: "Get exact quote" }}
              className="inline-flex min-h-12 w-full max-w-md items-center justify-center rounded-xl border-2 border-emerald-600 bg-white px-6 text-base font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50 sm:w-auto"
            >
              Get exact quote →
            </SeoHubGrowthCtaLink>
            <SeoHubGrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_pricing_quote_secondary`}
              ctx={analyticsCtx}
              ctaLocation="pricing"
              ctaLabel="Open the full booking builder"
              ctaKind="get_price"
              pricingInteraction={{ interaction: "get_exact_price_click", label: "Booking builder" }}
              className={`text-center text-sm font-semibold text-emerald-700 underline-offset-4 transition hover:underline ${linkEmphasisClassName}`}
            >
              Prefer to tweak rooms first? Open the full booking builder
            </SeoHubGrowthCtaLink>
          </div>
          <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
            <h3 className="text-base font-semibold text-emerald-950">Deep cleaning pricing in {name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-950/90">{structured.deepCleaningSummary}</p>
            <p className="mt-3 text-sm text-emerald-900">
              <Link href={deepPath} className={`font-semibold ${linkEmphasisClassName}`}>
                Deep cleaning service guide ({city})
              </Link>{" "}
              ·{" "}
              <SeoHubGrowthCtaLink
                href="/booking/details"
                source={`seo_loc_${slug}_pricing_deep`}
                ctx={analyticsCtx}
                ctaLocation="pricing"
                ctaLabel="See exact price"
                ctaKind="get_price"
                pricingInteraction={{ interaction: "get_exact_price_click", label: "See exact price (deep block)" }}
                className={`font-semibold ${linkEmphasisClassName}`}
              >
                See exact price
              </SeoHubGrowthCtaLink>
            </p>
          </div>
          <p className="mt-6 text-center">
            <SeoHubGrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_pricing_see_exact`}
              ctx={analyticsCtx}
              ctaLocation="pricing"
              ctaLabel={`See exact price for ${name}`}
              ctaKind="get_price"
              pricingInteraction={{ interaction: "get_exact_price_click", label: `Exact price ${name}` }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              See exact price for {name}
            </SeoHubGrowthCtaLink>
          </p>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-16" aria-labelledby="hub-risk-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-risk-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Book with less risk in {name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Most hesitation disappears when pricing, people, and payment timing are explicit—especially for apartments,
            estates, and Airbnb turnovers across {city}.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              {
                title: "No pay-before-you-agree surprises",
                body: `Lock scope and see your ${name} total online before we dispatch—you confirm when the quote matches your checklist.`,
              },
              {
                title: "Insured, vetted cleaners",
                body: "Teams are reference-checked and operate with coverage suited to professional home visits—not informal side gigs.",
              },
              {
                title: "Human support if access shifts",
                body: `Parking, lift codes, and pets change mid-week; support helps update your brief so ${city} crews arrive prepared.`,
              },
              {
                title: "Clear redo path",
                body: "If something verifiably misses the agreed scope, we route structured support rather than leaving you to chase individuals.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="font-semibold text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <SeoHubGrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_risk_cta`}
              ctx={analyticsCtx}
              ctaLocation="risk_section"
              ctaLabel={`Check availability for ${name}`}
              ctaKind="book_now"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Check availability for {name}
            </SeoHubGrowthCtaLink>
            <Link
              href={`/locations/${slug}#location-hub-faq`}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 ${linkEmphasisClassName}`}
            >
              Read FAQs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
