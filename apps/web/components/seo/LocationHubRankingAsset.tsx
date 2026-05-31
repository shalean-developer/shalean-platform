import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import type { SeoLocationAnalyticsBase } from "@/lib/analytics/track";
import { airbnbAreaLandingPathForLocationHub } from "@/lib/seo/airbnbAreaLandingPages";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import {
  buildApartmentsModuleHeading,
  buildApartmentsModuleLead,
  buildDefaultRankingHeroIntro,
  buildNearMeParagraph,
  buildSpecialisedCareCopy,
  buildTrustBulletLines,
  pricingLeadFromRow,
} from "@/lib/seo/location-ranking-asset-copy";
import type { ResolvedLocationRanking } from "@/lib/seo/resolve-location-ranking-sections";
import { getProgrammaticLocation, nearbyProgrammaticLocations } from "@/lib/seo/locations";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES, type LocationSeoBlock } from "@/lib/seo/capeTownSeoPages";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  location: CapeTownLocationRow;
  seo: LocationSeoBlock;
  ranking: ResolvedLocationRanking;
  ctx: SeoLocationAnalyticsBase;
};

export function buildRankingHeroParagraphs(location: CapeTownLocationRow, seo: LocationSeoBlock): string[] {
  return seo.rankingHeroIntro?.length ? seo.rankingHeroIntro : buildDefaultRankingHeroIntro(location, seo);
}

export function LocationHubRankingAsset({ location, seo, ranking, ctx }: Props) {
  const slug = location.slug;
  const { name } = location;
  const linkClass = `${linkEmphasisClassName} font-semibold`;

  const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const airbnb = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const window = CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path;

  const hubPath = LOCATION_SEO_PAGES[slug as keyof typeof LOCATION_SEO_PAGES]?.path ?? `/locations/${slug}`;
  const airbnbAreaGuide = airbnbAreaLandingPathForLocationHub(slug);
  const nearbyPairDefault = nearbyProgrammaticLocations(slug, 4).filter((l) => l.slug !== slug).slice(0, 2);
  const nearbyPair =
    seo.rankingMidNearbySlugs?.length ?
      seo.rankingMidNearbySlugs
        .map((s) => getProgrammaticLocation(s))
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 2)
    : nearbyPairDefault;
  const hint = getLocationMetaPriceHint(location);
  const priceLead = pricingLeadFromRow(location);
  const midProvidePrefix = seo.rankingMidProvidePrefix ?? "We provide reliable";
  const midAudiencePhrase =
    seo.rankingMidAudiencePhrase ?? "for apartments, Airbnb properties, and residential homes.";
  const nearbyLead =
    seo.rankingMidNearbyLead ?? "Our team also operates across nearby areas including";

  const pricingSection = ranking.pricing ? (
    <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning prices in {name}</h2>
        {seo.rankingPricingParagraph ? (
          <p className="mt-6 text-base leading-relaxed text-zinc-600">{seo.rankingPricingParagraph}</p>
        ) : ranking.tier === "medium" ? (
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Cleaning prices in {name} reflect bedrooms, bathrooms, and service type—many visits start from around {priceLead}{" "}
            before add-ons. Illustrated bands often sit around {hint}. Airbnb turnovers and deep cleans cost more when
            turnaround is tight.
          </p>
        ) : (
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Cleaning prices in {name} typically start from around {priceLead} depending on property size, condition, and
            service type. Typical illustrated bands sit around {hint}. Airbnb turnovers and deep cleaning may cost more
            depending on workload and turnaround time.
          </p>
        )}
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          <SeoHubGrowthCtaLink
            href="/booking/details"
            source={`seo_loc_${slug}_ranking_price_quote`}
            ctx={ctx}
            ctaLocation={`${slug}_pricing_section`}
            ctaLabel="Get an exact quote for your property"
            ctaKind="get_price"
            className={`inline font-semibold ${linkEmphasisClassName}`}
          >
            Get an exact quote for your property
          </SeoHubGrowthCtaLink>
        </p>
      </div>
    </section>
  ) : null;

  const midLinksSection = ranking.midInternalLinks ? (
    <div className="mt-8 space-y-4 border-t border-zinc-200 pt-8 text-base leading-relaxed text-zinc-600">
      <p>
        {midProvidePrefix}{" "}
        <Link href={hubPath} className={linkClass}>
          cleaning services in {name}
        </Link>{" "}
        {midAudiencePhrase}
      </p>
      {ranking.serviceReinforcement ? (
        <p>
          {seo.rankingServiceReinforcementParagraph ??
            `From regular home cleaning to detailed move out cleaning, our services are designed to meet the needs of ${name} residents and property managers.`}
        </p>
      ) : null}
      {nearbyPair.length > 0 ? (
        <p>
          {nearbyLead}{" "}
          {nearbyPair.map((loc, i) => (
            <span key={loc.slug}>
              {i > 0 ? " and " : null}
              <Link href={`/locations/${loc.slug}`} className={linkClass}>
                {loc.name}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  ) : null;

  if (ranking.tier === "medium") {
    return (
      <>
        {pricingSection}
        {ranking.apartmentsModule && ranking.nearMeParagraph ? (
          <section className="border-b border-zinc-100 py-14">
            <div className="mx-auto max-w-4xl px-4">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Local cleaning in {name}</h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">{buildNearMeParagraph(location)}</p>
            </div>
          </section>
        ) : null}
        {ranking.serviceList ? (
          <section className="border-b border-zinc-100 bg-zinc-50/40 py-16">
            <div className="mx-auto max-w-4xl px-4">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Book services in {name}</h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                Choose a Cape Town service guide, enter your {name} address at checkout, and lock scope before we dispatch.
              </p>
              <ul className="mt-6 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700">
                <li>
                  <Link href={standard} className={linkClass}>
                    Standard home cleaning
                  </Link>
                </li>
                <li>
                  <Link href={deep} className={linkClass}>
                    Deep cleaning services
                  </Link>
                </li>
                <li>
                  <Link href={moveOut} className={linkClass}>
                    Move-out cleaning
                  </Link>
                </li>
                <li>
                  <Link href={airbnb} className={linkClass}>
                    Airbnb cleaning
                  </Link>
                </li>
                <li>
                  <Link href={window} className={linkClass}>
                    Window cleaning
                  </Link>
                </li>
              </ul>
              {ranking.midInternalLinks ? (
                <div className="mt-8 space-y-4 text-base leading-relaxed text-zinc-600">
                  <p>
                    We provide reliable{" "}
                    <Link href={hubPath} className={linkClass}>
                      cleaning services in {name}
                    </Link>{" "}
                    for homes and rentals across {location.region}.
                  </p>
                  {nearbyPair.length > 0 ? (
                    <p>
                      Nearby hubs:{" "}
                      {nearbyPair.map((loc, i) => (
                        <span key={loc.slug}>
                          {i > 0 ? " · " : null}
                          <Link href={`/locations/${loc.slug}`} className={linkClass}>
                            {loc.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  const specialised = ranking.specialisedCare ? buildSpecialisedCareCopy(location) : null;

  return (
    <>
      {ranking.specialisedCare && specialised ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{specialised.heading}</h2>
            <p className="mt-6 text-base leading-relaxed text-zinc-600">{specialised.intro}</p>
            <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-700">
              {specialised.bullets.map((b) => (
                <li key={b.title}>
                  <strong className="text-zinc-900">{b.title}</strong> {b.body}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-base leading-relaxed text-zinc-600">{specialised.closing}</p>
          </div>
        </section>
      ) : null}

      {ranking.apartmentsModule ? (
        <section className="border-b border-zinc-100 bg-white py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{buildApartmentsModuleHeading(name)}</h2>
            <p className="mt-6 text-base leading-relaxed text-zinc-600">{buildApartmentsModuleLead(location, seo)}</p>
            {ranking.nearMeParagraph ? (
              <p className="mt-4 text-base leading-relaxed text-zinc-600">{buildNearMeParagraph(location)}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {pricingSection}

      {ranking.serviceList ? (
        <section className="border-b border-zinc-100 bg-white py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning services available in {name}</h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              We offer a full range of professional cleaning services in {name}, including:
            </p>
            <ul className="mt-6 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700">
              <li>
                <Link href={standard} className={linkClass}>
                  Standard home cleaning
                </Link>
              </li>
              <li>
                <Link href={deep} className={linkClass}>
                  Deep cleaning services
                </Link>
              </li>
              <li>
                <Link href={moveOut} className={linkClass}>
                  Move-out / end of tenancy cleaning
                </Link>
              </li>
              <li>
                <Link href={airbnb} className={linkClass}>
                  Airbnb cleaning and turnovers
                </Link>
              </li>
              <li>
                <Link href={window} className={linkClass}>
                  Window cleaning services
                </Link>
              </li>
            </ul>
            <p className="mt-6 text-base leading-relaxed text-zinc-600">
              Whether you need regular cleaning or a once-off service, we match you with experienced cleaners who understand{" "}
              {name} properties.
            </p>
            <p className="mt-4 text-sm text-zinc-600">
              More guides:{" "}
              <Link href="/services" className={linkClass}>
                all Cape Town cleaning services
              </Link>
              .
            </p>
            {midLinksSection}
          </div>
        </section>
      ) : null}

      {ranking.airbnbBoost ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Airbnb cleaning in {name}</h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              {seo.hasAirbnbFocus !== false
                ? `${name} stays busy with short-stay demand—our Airbnb cleaning service is built for fast turnaround, consistent quality, and guest-ready presentation between bookings.`
                : `Hosts and furnished rentals in ${name} still benefit from turnover-ready cleans—our Airbnb cleaning playbook keeps kitchens and bathrooms aligned with listing photos.`}
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              We handle linen changes, restocking, and detailed cleaning between bookings where your scope includes
              them—helping you protect reviews and occupancy.
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              Looking for reliable{" "}
              <Link href={airbnb} className={linkClass}>
                airbnb cleaning in Cape Town
              </Link>
              ? We provide fast turnaround cleaning for {name} properties when calendars stack tight.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-base font-medium text-zinc-800">
              <Link href={airbnb} className={linkClass}>
                View Airbnb cleaning services
              </Link>
              {airbnbAreaGuide ? (
                <>
                  <span className="text-zinc-300" aria-hidden>
                    ·
                  </span>
                  <Link href={airbnbAreaGuide} className={linkClass}>
                    {name} Airbnb turnover guide
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {ranking.trustBullets ? (
        <section className="border-b border-zinc-100 bg-white py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Why choose Shalean in {name}</h2>
            <ul className="mt-8 space-y-4">
              {buildTrustBulletLines(name).map((line) => (
                <li
                  key={line}
                  className="flex gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/90 px-5 py-4 text-sm leading-relaxed text-zinc-700 shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-base leading-relaxed text-zinc-600">
              Book your {name} cleaning service in minutes and get matched with a reliable cleaner near you.
            </p>
          </div>
        </section>
      ) : null}

      {ranking.ctaBand ? (
        <section className="border-b border-emerald-100 bg-emerald-50/40 py-14">
          <div className="mx-auto max-w-4xl px-4">
            <h3 className="text-xl font-bold tracking-tight text-zinc-900 md:text-2xl">
              Book cleaning services in {name}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Get instant pricing and availability for your home or rental.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <SeoHubGrowthCtaLink
                href="/booking/details"
                source={`seo_loc_${slug}_ranking_check_availability`}
                ctx={ctx}
                ctaLocation={`${slug}_ranking_band`}
                ctaLabel="Check availability"
                ctaKind="book_now"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Check availability
              </SeoHubGrowthCtaLink>
              <SeoHubGrowthCtaLink
                href={airbnb}
                source={`seo_loc_${slug}_ranking_airbnb_secondary`}
                ctx={ctx}
                ctaLocation={`${slug}_ranking_band`}
                ctaLabel="Airbnb cleaning"
                ctaKind="compare"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
              >
                Airbnb cleaning
              </SeoHubGrowthCtaLink>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
