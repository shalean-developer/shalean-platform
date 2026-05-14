import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { HubBlogCard } from "@/lib/blog/get-all-posts";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { LocationHubAirbnbCleaningSection } from "@/components/seo/LocationHubAirbnbCleaningSection";
import { LocationHubBlogSection } from "@/components/seo/LocationHubBlogSection";
import { LocationHubEngagementClient } from "@/components/seo/LocationHubEngagementClient";
import { LocationHubMidBanner } from "@/components/seo/LocationHubMidBanner";
import { LocationHubQueryExpansion } from "@/components/seo/LocationHubQueryExpansion";
import { LocationFAQSection } from "@/components/seo/LocationFAQSection";
import { LocationHubAuthoritySection } from "@/components/seo/LocationHubAuthoritySection";
import { LocationHubComparisonSection } from "@/components/seo/LocationHubComparisonSection";
import { LocationHubEntityStack } from "@/components/seo/LocationHubEntityStack";
import { LocationHubRegionPeersSection } from "@/components/seo/LocationHubRegionPeersSection";
import { LocationHubRankingSections } from "@/components/seo/LocationHubRankingSections";
import { buildRankingHeroParagraphs, LocationHubRankingAsset } from "@/components/seo/LocationHubRankingAsset";
import { LocationHubSessionDepth } from "@/components/seo/LocationHubSessionDepth";
import { LocationHubShareBar } from "@/components/seo/LocationHubShareBar";
import { SeaPointLocationEnhancements } from "@/components/seo/SeaPointLocationEnhancements";
import { LocationReviewHighlights } from "@/components/seo/LocationReviewHighlights";
import { LocationHubServiceDemandSection } from "@/components/seo/LocationHubServiceDemandSection";
import { LocationHubTrustedResidentsSection } from "@/components/seo/LocationHubTrustedResidentsSection";
import { LocationTrustSignals } from "@/components/seo/LocationTrustSignals";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import { LocationHubServiceTiles } from "@/components/seo/LocationHubServiceTiles";
import { SeoHubGrowthCtaLink } from "@/components/seo/SeoHubGrowthCtaLink";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import {
  locationFooterCtaMicrocopy,
  locationHeroCtaMicrocopy,
  locationStickyCtaLine,
} from "@/lib/seo/location-commercial-copy";
import { buildStructuredLocationIntro, mergeIntroWithPrimaryKeyword } from "@/lib/seo/location-content-variation";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, type CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { buildLifestyleDepthParagraphs } from "@/lib/seo/location-lifestyle-depth";
import { directAnswerWhatCleaningServicesAreAvailable } from "@/lib/seo/location-featured-snippet-copy";
import { getLocationGeoHints } from "@/lib/seo/location-geo-enrichment";
import { primaryLocationKeywordPhrase } from "@/lib/seo/location-keyword";
import { getLocationSeoPriority, hubContentTierFromPriority } from "@/lib/seo/location-priority";
import { CAPE_TOWN_SERVICE_SEO, type LocationSeoBlock } from "@/lib/seo/capeTownSeoPages";
import { getLocationHubAboveFoldServiceLink, getLocationHubRelatedServiceLinks } from "@/lib/seo/internalLinks";
import { pickNearbyHubAnchor } from "@/lib/seo/anchorVariants";
import {
  getLocationHubPeerContextLine,
  getLocationHubStandardCleaningMoneyParagraph,
} from "@/lib/seo/location-hub-authority-copy";
import { getLocationEditorialOverride } from "@/lib/seo/location-editorial-overrides";
import { buildDynamicLocationFaqs, nearbyProgrammaticLocationsPreferRegion } from "@/lib/seo/locations";
import { buildPeopleAlsoAskFaqs, mergeLocationFaqs } from "@/lib/seo/location-paa-faqs";
import { buildLocationLocalProofBullets } from "@/lib/seo/location-hub-local-proof";
import { buildCostFaqAnswer } from "@/lib/seo/location-ranking-asset-copy";
import { getLocationPricingHeroLine } from "@/lib/seo/location-pricing";
import { resolveLocationRankingSections } from "@/lib/seo/resolve-location-ranking-sections";
import { buildLocationHubJsonLd } from "@/lib/seo/structured-data";
import { LOCATION_PAGE_CONTENT_GROUP } from "@/lib/seo/search-console-readiness";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";
import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import type { LocationHubMarketingReviewSnippet } from "@/lib/seo/location-hub-marketing-reviews";
import { buildSeoBookingHref, locationSlugFromSeoLocationSlug } from "@/lib/booking/seoBookingPrefill";

type Props = {
  location: CapeTownLocationRow;
  seo: LocationSeoBlock | null;
  trustStats: PublicReviewBannerStats | null;
  /** Matches `<meta name="description">` and Open Graph (via `resolveLocationSeoMetaFields`). */
  metaDescription: string;
  blogCards: HubBlogCard[];
  /** Active `<title>` template id for CTR experiments (`LOCATION_SEO_FEEDBACK_JSON`). */
  titleVariant: LocationTitleVariantId;
  /** When true, hero booking CTAs swap order and the “see total first” path takes primary visual weight. */
  swapHeroBookCtas?: boolean;
  /** Optional verified booking reviews whose address matches this suburb (Supabase RPC). */
  marketingReviewSnippets?: LocationHubMarketingReviewSnippet[] | null;
};

const STANDARD_SERVICE = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
const DEEP_SERVICE = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const MOVE_OUT_SERVICE = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;

/** Editorial themes — not attributed verbatim quotes; avoids repeating star-count boilerplate. */
function locationCustomerVoiceBullets(loc: CapeTownLocationRow): string[] {
  const { name } = loc;
  return [
    `Clear totals before arrival and on-time starts show up often on ${name} visits—wet areas carry most of the perceived quality.`,
    `Kitchens and bathrooms lead feedback when scope matched the room list locked at checkout.`,
    `Same-week slots appear when routing allows; lock bedrooms, bathrooms, and add-ons online before you pick a time.`,
  ];
}

function defaultWhyChooseBullets(loc: CapeTownLocationRow): string[] {
  const { name, city } = loc;
  return [
    `Vetted, insured cleaners who understand typical ${name} homes—from apartments to freestanding houses.`,
    `Clear scope and pricing online before we dispatch; no surprise surcharges for what you selected.`,
    `Human support when access codes, parking, or pets need a quick update in ${city}.`,
  ];
}

const HERO_SOLID_CLASS =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700";
const HERO_OUTLINE_CLASS =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50";

export function ProgrammaticLocationCleaningPage({
  location,
  seo,
  trustStats,
  metaDescription,
  blogCards,
  titleVariant,
  swapHeroBookCtas = false,
  marketingReviewSnippets = null,
}: Props) {
  const slug = location.slug;
  const editorialOverride = getLocationEditorialOverride(slug);
  const seoPriority = getLocationSeoPriority(location);
  const hubTier = hubContentTierFromPriority(seoPriority);
  const lifestyleDepth = buildLifestyleDepthParagraphs(location, hubTier);
  const stickyBookingLine = locationStickyCtaLine(location);
  const h1 =
    slug === "sea-point-cleaning-services" && seo?.h1?.trim()
      ? seo.h1.trim()
      : primaryLocationKeywordPhrase(location);
  const intro = seo?.intro?.length
    ? mergeIntroWithPrimaryKeyword(seo.intro, location)
    : buildStructuredLocationIntro(location);
  const nearby = nearbyProgrammaticLocationsPreferRegion(slug, 6);
  const geoHints = getLocationGeoHints(slug);
  const rankingResolved = seo ? resolveLocationRankingSections(seo) : null;
  const rankingHeroParagraphs =
    rankingResolved?.useRankingHero && seo ? buildRankingHeroParagraphs(location, seo) : null;
  const baseFaqs = seo?.faqs?.length ? seo.faqs : buildDynamicLocationFaqs(location);
  const peopleAlsoAskBase = buildPeopleAlsoAskFaqs(location);
  const peopleAlsoAskSeedRaw =
    editorialOverride?.extraFaqs?.length && editorialOverride.extraFaqs.length > 0
      ? [...editorialOverride.extraFaqs, ...peopleAlsoAskBase]
      : peopleAlsoAskBase;
  const peopleAlsoAskSeed = location.localizedFaq
    ? [{ q: location.localizedFaq.q, a: location.localizedFaq.a }, ...peopleAlsoAskSeedRaw]
    : peopleAlsoAskSeedRaw;
  const peopleAlsoAsk =
    rankingResolved?.prependCostFaq
      ? [
          {
            q: `How much does cleaning cost in ${location.name}?`,
            a: seo?.rankingCostFaqAnswer ?? buildCostFaqAnswer(location),
          },
          ...peopleAlsoAskSeed,
        ]
      : peopleAlsoAskSeed;
  const mergedFaqs = mergeLocationFaqs(
    peopleAlsoAsk,
    baseFaqs.map((f) => ({ q: f.q, a: f.a })),
  );
  const eyebrow = `${location.city} · ${location.region}`;
  const bookCtaLabel = `Book a cleaner in ${location.name}`;
  const hubAboveFoldServiceLink = getLocationHubAboveFoldServiceLink(location.name, slug);
  const bookingLocationSlug = locationSlugFromSeoLocationSlug(slug);
  const bookingDetailsHref = buildSeoBookingHref("details", {
    service: "standard",
    locationSlug: bookingLocationSlug,
    source: `seo_loc_${slug}_details`,
  });
  const bookingStartHref = buildSeoBookingHref("entry", {
    service: "standard",
    locationSlug: bookingLocationSlug,
    source: `seo_loc_${slug}_start`,
  });

  const seoCtx = {
    page_slug: slug,
    suburb: location.name,
    region: location.region,
    title_variant: titleVariant,
    page_type: "seo_location" as const,
  };

  const pageUrl = `${SITE_ORIGIN}/locations/${slug}`;
  const locationsIndexUrl = `${SITE_ORIGIN}/locations`;

  const jsonLd = buildLocationHubJsonLd({
    pageUrl,
    locationsIndexUrl,
    siteOrigin: SITE_ORIGIN,
    h1,
    metaDescription,
    location,
    faqs: mergedFaqs,
    nearbyPlaceNames: nearby,
    serviceSchemaName:
      slug === "sea-point-cleaning-services" ?
        "Cleaning Services in Sea Point Cape Town"
      : `Cleaning services in ${location.name}`,
    serviceAreaServedSimpleName: slug === "sea-point-cleaning-services" ? "Sea Point" : undefined,
    serviceOffers:
      slug === "sea-point-cleaning-services" ?
        { priceCurrency: "ZAR", lowPrice: "300", highPrice: "650" }
      : undefined,
  });

  const whyChooseItems = seo?.whyChoose?.length ? seo.whyChoose : defaultWhyChooseBullets(location);

  return (
    <main className="bg-white pb-32 text-zinc-900" data-location-hub-root>
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{
          page_type: "seo_location",
          slug,
          page_slug: slug,
          suburb: location.name,
          region: location.region,
          title_variant: titleVariant,
          content_group: LOCATION_PAGE_CONTENT_GROUP,
          primary_kw: h1,
          seo_priority: seoPriority,
          hub_tier: hubTier,
          location_ranking_tier: rankingResolved?.tier ?? "none",
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-4xl px-4 pt-8">
        <SeoBreadcrumbs
          includeJsonLd={false}
          items={[
            { name: "Home", href: "/" },
            { name: "Locations", href: "/locations" },
            { name: location.name, href: `/locations/${slug}`, current: true },
          ]}
        />
        <p className="mt-3 text-sm text-zinc-600">
          <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={`font-medium ${linkEmphasisClassName}`}>
            Cape Town cleaning overview
          </Link>
          <span className="mx-2 text-zinc-300" aria-hidden>
            ·
          </span>
          <Link href={STANDARD_SERVICE} className={`font-medium ${linkEmphasisClassName}`}>
            Citywide house cleaning hub
          </Link>
          <span className="mx-2 text-zinc-300" aria-hidden>
            ·
          </span>
          <Link href="/locations" className={`font-medium ${linkEmphasisClassName}`}>
            All suburb hubs
          </Link>
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Updated for 2026 · Scope and pricing reflect current Cape Town operations.
        </p>
      </div>

      <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/60 via-white to-white py-14">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{h1}</h1>
          {slug === "sea-point-cleaning-services" ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold tracking-tight text-zinc-800">
              <span>From R250</span>
              <span className="hidden text-zinc-300 sm:inline" aria-hidden>
                •
              </span>
              <span>Same-day cleaning</span>
              <span className="hidden text-zinc-300 sm:inline" aria-hidden>
                •
              </span>
              <span>Trusted local cleaners</span>
            </p>
          ) : null}
          {slug === "sea-point-cleaning-services" ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600">
              Looking for{" "}
              <strong className="font-semibold text-zinc-800">cleaning services near you in Sea Point</strong>? Book online
              with upfront pricing—your Sea Point address locks scope before checkout.
            </p>
          ) : null}
          {(() => {
            const money = getLocationHubStandardCleaningMoneyParagraph(slug);
            return (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 md:text-lg">
                {money.before}{" "}
                <Link href={STANDARD_SERVICE} className={`font-semibold ${linkEmphasisClassName}`}>
                  {money.anchor}
                </Link>
                {money.after}
              </p>
            );
          })()}
          {editorialOverride ? (
            <div className="mt-5 space-y-2 rounded-xl border border-emerald-100 bg-white/80 px-4 py-4 text-base leading-relaxed text-zinc-700 shadow-sm md:text-lg">
              <p>{editorialOverride.localLead}</p>
              <p className="text-sm text-zinc-500">
                <span className="font-semibold text-zinc-600">Local anchors:</span>{" "}
                {editorialOverride.landmarks.join(" · ")}
              </p>
            </div>
          ) : null}
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-zinc-600">
            <p>
              Start with{" "}
              <Link href={hubAboveFoldServiceLink.href} className={`font-semibold ${linkEmphasisClassName}`}>
                {hubAboveFoldServiceLink.anchor}
              </Link>{" "}
              when you know your room list; deep and move-out are linked below.
            </p>
            {rankingHeroParagraphs
              ? rankingHeroParagraphs.map((p, i) => <p key={i}>{p}</p>)
              : intro.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
          </div>
          {seo?.relatedBlogGuide ? (
            <p className="mt-5 text-base leading-relaxed text-zinc-600 md:text-lg">
              Need a full breakdown of cleaning options, pricing, and services? Read our guide:{" "}
              <Link href={seo.relatedBlogGuide.href} className={`font-semibold ${linkEmphasisClassName}`}>
                {seo.relatedBlogGuide.linkAnchorText}
              </Link>
              .
            </p>
          ) : null}
          {nearby.length > 0 ? (
            <p className="mt-5 text-base leading-relaxed text-zinc-600">
              Compare nearby hubs:{" "}
              {nearby.slice(0, 3).map((loc, i, arr) => (
                <span key={loc.slug}>
                  {i > 0 ? (i === arr.length - 1 ? " or " : ", ") : null}
                  <Link href={`/locations/${loc.slug}`} className={`${linkEmphasisClassName} font-medium`}>
                    {pickNearbyHubAnchor(`${slug}|hero-near|${loc.slug}`, loc.name)}
                  </Link>
                  {i === arr.length - 1 ? "." : null}
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-5 border-l-4 border-emerald-200 pl-4 text-base font-medium leading-relaxed text-zinc-800">
            {location.uniqueContextLine}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            <span className="font-semibold text-zinc-800">Typical pricing in {location.name}: </span>
            {getLocationPricingHeroLine(location)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            <Link href="/cleaning-prices-cape-town" className={linkEmphasisClassName}>
              Check cleaning prices in Cape Town
            </Link>{" "}
            for your area.
          </p>
          {!rankingResolved?.useRankingHero && hubTier !== "base" ? (
            <p className="mt-5 text-base leading-relaxed text-zinc-700">
              {location.name} bookings span hosts, tenants, and family homes—your address and room list set the checklist
              before you confirm.
            </p>
          ) : null}
          <p className="mt-4 text-sm font-medium text-zinc-700">
            {publicTrustRatingBadgeLine(trustStats)} · Totals lock online before dispatch.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {(swapHeroBookCtas
              ? [
                  {
                    key: "total_first" as const,
                    href: bookingStartHref,
                    label: "Book now — see total first",
                    source: `seo_loc_${slug}_book_now`,
                    ctaLabel: "Book now — see total first",
                  },
                  {
                    key: "details" as const,
                    href: bookingDetailsHref,
                    label: bookCtaLabel,
                    source: `seo_loc_${slug}_hero`,
                    ctaLabel: bookCtaLabel,
                  },
                ]
              : [
                  {
                    key: "details" as const,
                    href: bookingDetailsHref,
                    label: bookCtaLabel,
                    source: `seo_loc_${slug}_hero`,
                    ctaLabel: bookCtaLabel,
                  },
                  {
                    key: "total_first" as const,
                    href: bookingStartHref,
                    label: "Book now — see total first",
                    source: `seo_loc_${slug}_book_now`,
                    ctaLabel: "Book now — see total first",
                  },
                ]
            ).map((slot) => {
              const solid =
                (!swapHeroBookCtas && slot.key === "details") || (swapHeroBookCtas && slot.key === "total_first");
              return (
                <SeoHubGrowthCtaLink
                  key={slot.key}
                  href={slot.href}
                  source={slot.source}
                  ctx={seoCtx}
                  ctaLocation="hero"
                  ctaLabel={slot.ctaLabel}
                  ctaKind="book_now"
                  className={solid ? HERO_SOLID_CLASS : HERO_OUTLINE_CLASS}
                >
                  {slot.label}
                </SeoHubGrowthCtaLink>
              );
            })}
          </div>
          <p className="mt-3 text-base font-semibold text-zinc-900">
            <SeoHubGrowthCtaLink
              href={bookingStartHref}
              source={`seo_loc_${slug}_intent_book_cleaner`}
              ctx={seoCtx}
              ctaLocation="hero_after_buttons"
              ctaLabel={bookCtaLabel}
              ctaKind="book_now"
              className={linkEmphasisClassName}
            >
              {bookCtaLabel}
            </SeoHubGrowthCtaLink>
          </p>
          <p className="mt-4 text-sm font-medium text-emerald-900">{locationHeroCtaMicrocopy(location)}</p>
        </div>
      </section>

      {slug === "sea-point-cleaning-services" ? (
        <SeaPointLocationEnhancements ctx={seoCtx} quoteHref={bookingDetailsHref} />
      ) : null}

      <LocationHubRegionPeersSection location={location} />

      <LocationHubTrustedResidentsSection locationName={location.name} snippets={marketingReviewSnippets ?? []} />

      <section className="border-b border-zinc-100 bg-zinc-50/40 py-12" aria-labelledby="hub-popular-ct-services-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-popular-ct-services-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            What type of cleaning service do you need?
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Pick a guide, then confirm your {location.name} address at checkout so scope matches lifts, parking, and the
            bathrooms you selected.
          </p>
          <ul className="mt-6 space-y-3 text-base leading-relaxed text-zinc-700">
            <li>
              <Link href={STANDARD_SERVICE} className={`font-semibold ${linkEmphasisClassName}`}>
                Standard Cleaning
              </Link>{" "}
              — weekly or once-off home cleaning
            </li>
            <li>
              <Link href={DEEP_SERVICE} className={`font-semibold ${linkEmphasisClassName}`}>
                Deep Cleaning
              </Link>{" "}
              — for kitchens, bathrooms, and detailed cleaning
            </li>
            <li>
              <Link href={MOVE_OUT_SERVICE} className={`font-semibold ${linkEmphasisClassName}`}>
                Move Out Cleaning
              </Link>{" "}
              — for end-of-lease or property handovers
            </li>
          </ul>
        </div>
      </section>

      {rankingResolved?.active && seo ? (
        <LocationHubRankingAsset location={location} seo={seo} ranking={rankingResolved} ctx={seoCtx} />
      ) : null}

      {seo?.localAngle?.length && !rankingResolved?.skipLocalAngle ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Local context</h2>
            <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
              {seo.localAngle.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {geoHints ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Landmarks & local geography</h2>
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Crews regularly brief around{" "}
              <span className="font-medium text-zinc-800">{geoHints.landmarks.join(", ")}</span>
              {geoHints.roads && geoHints.roads.length > 0 ? (
                <>
                  {" "}
                  along corridors such as{" "}
                  <span className="font-medium text-zinc-800">{geoHints.roads.join(", ")}</span>
                </>
              ) : null}
              {geoHints.microAreas.length > 0 ? (
                <>
                  {" "}
                  plus micro-areas such as{" "}
                  <span className="font-medium text-zinc-800">{geoHints.microAreas.join(", ")}</span>
                </>
              ) : null}{" "}
              —mention building access, parking, and outdoor zones in your booking notes so scope matches what teams see
              on the ground in {location.name}.
            </p>
            {geoHints.propertyTypeDensity ||
            geoHints.parkingNotes ||
            geoHints.accessNotes ||
            (geoHints.estates && geoHints.estates.length > 0) ||
            (geoHints.apartmentZones && geoHints.apartmentZones.length > 0) ||
            geoHints.transportAccess ? (
              <ul className="mt-6 list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-700">
                {geoHints.propertyTypeDensity ? (
                  <li>
                    <span className="font-medium text-zinc-900">Property mix: </span>
                    {geoHints.propertyTypeDensity}
                  </li>
                ) : null}
                {geoHints.estates && geoHints.estates.length > 0 ? (
                  <li>
                    <span className="font-medium text-zinc-900">Estates / complexes: </span>
                    {geoHints.estates.join(", ")}
                  </li>
                ) : null}
                {geoHints.apartmentZones && geoHints.apartmentZones.length > 0 ? (
                  <li>
                    <span className="font-medium text-zinc-900">Apartment zones: </span>
                    {geoHints.apartmentZones.join(", ")}
                  </li>
                ) : null}
                {geoHints.transportAccess ? (
                  <li>
                    <span className="font-medium text-zinc-900">Transport & access: </span>
                    {geoHints.transportAccess}
                  </li>
                ) : null}
                {geoHints.parkingNotes ? (
                  <li>
                    <span className="font-medium text-zinc-900">Parking: </span>
                    {geoHints.parkingNotes}
                  </li>
                ) : null}
                {geoHints.accessNotes ? (
                  <li>
                    <span className="font-medium text-zinc-900">Access: </span>
                    {geoHints.accessNotes}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      <LocationHubServiceDemandSection location={location} />

      <LocationHubEntityStack location={location} slug={slug} />

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Homes & lifestyle in {location.name}</h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-600">
            {lifestyleDepth.map((p, i) => (
              <p key={`life-${i}-${p.slice(0, 24)}`}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <LocationTrustSignals location={location} trustStats={trustStats} />

      <LocationHubAuthoritySection location={location} />

      <section className="border-b border-zinc-100 bg-white py-14" aria-labelledby="hub-local-proof-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-local-proof-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Why residents in {location.name} choose Shalean
          </h2>
          <ul className="mt-6 space-y-4">
            {buildLocationLocalProofBullets(location).map((line, i) => (
              <li
                key={`proof-${i}-${line.slice(0, 12)}`}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/90 px-5 py-4 text-sm leading-relaxed text-zinc-700 shadow-sm"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <LocationHubRankingSections location={location} slug={slug} analyticsCtx={seoCtx} />

      <LocationReviewHighlights location={location} />

      {!rankingResolved?.skipDefaultWhyChoose ? (
        <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Why choose Shalean in {location.name}?</h2>
            <ul className="mt-8 space-y-4">
              {whyChooseItems.map((item, wi) => (
                <li
                  key={`why-${wi}-${item.slice(0, 24)}`}
                  className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700 shadow-sm"
                >
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <LocationHubComparisonSection location={location} />

      <LocationHubMidBanner location={location} slug={slug} tier={hubTier} analyticsCtx={seoCtx} />

      {!rankingResolved?.skipDefaultServicesStrip ? (
        <section className="border-b border-zinc-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Services available in {location.name}</h2>
            <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-base font-medium leading-relaxed text-zinc-800">
              {directAnswerWhatCleaningServicesAreAvailable(location)}
            </p>
            <h3 className="mt-8 text-lg font-semibold tracking-tight text-zinc-900">
              Related services in {location.name}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Citywide guides below—checkout still pins to your {location.name} street and room list.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700">
              {getLocationHubRelatedServiceLinks(location.name, slug).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={`font-medium ${linkEmphasisClassName}`}>
                    {item.anchor}
                  </Link>
                </li>
              ))}
            </ul>
            <LocationHubServiceTiles
              ctx={seoCtx}
              tiles={[
                { href: `${STANDARD_SERVICE}?location=${bookingLocationSlug}`, label: "Standard cleaning" },
                { href: `${DEEP_SERVICE}?location=${bookingLocationSlug}`, label: "Deep cleaning" },
                { href: `${MOVE_OUT_SERVICE}?location=${bookingLocationSlug}`, label: "Move-out cleaning" },
              ]}
            />
            <p className="mt-6 text-sm text-zinc-600">
              More guides:{" "}
              <Link href="/services" className={linkEmphasisClassName}>
                all Cape Town cleaning services
              </Link>
              .
            </p>
            <div className="mt-8">
              <SeoHubGrowthCtaLink
                href={bookingDetailsHref}
                source={`seo_loc_${slug}_services_book_now`}
                ctx={seoCtx}
                ctaLocation="services_section"
                ctaLabel="Book now"
                ctaKind="book_now"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Book now
              </SeoHubGrowthCtaLink>
            </div>
          </div>
        </section>
      ) : null}

      {!rankingResolved?.skipDefaultAirbnbStrip ? (
        <LocationHubAirbnbCleaningSection locationName={location.name} hubSlug={slug} />
      ) : null}

      <LocationHubQueryExpansion location={location} slug={slug} tier={hubTier} />

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">What customers say in {location.name}</h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Recurring themes from {location.name} bookings (summaries, not verbatim quotes). Citywide quality signals still
            live on the public Google profile for Shalean—this section stays suburb-specific.
          </p>
          <ul className="mt-6 space-y-3 text-sm leading-relaxed text-zinc-700">
            {locationCustomerVoiceBullets(location).map((line, i) => (
              <li key={i} className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-16" aria-labelledby="hub-nearby-areas-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="hub-nearby-areas-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Cleaning services near {location.name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            We also provide professional cleaning services in nearby Cape Town areas—each hub explains local access and
            links to the same citywide guides you can book for your street.
          </p>
          {nearby.length > 0 ? (
            <ul className="mt-6 space-y-4 text-base leading-relaxed text-zinc-700">
              {nearby.map((loc) => (
                <li key={loc.slug}>
                  <Link href={`/locations/${loc.slug}`} className={`font-semibold ${linkEmphasisClassName}`}>
                    Cleaning services in {loc.name}
                  </Link>
                  <span className="text-zinc-600"> — {getLocationHubPeerContextLine(loc.slug)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-base leading-relaxed text-zinc-600">
              Explore other {location.city} suburb hubs—each page is tailored to {location.region} demand and links to
              booking with transparent quoting. Start from the{" "}
              <Link href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={`font-semibold ${linkEmphasisClassName}`}>
                Cape Town cleaning hub
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <LocationHubBlogSection locationName={location.name} locationSlug={slug} cards={blogCards} />

      <LocationFAQSection
        locationName={location.name}
        items={mergedFaqs}
        analytics={{ page_slug: slug, suburb: location.name }}
      />

      <div className="mx-auto max-w-4xl px-4 pb-4">
        <LocationHubShareBar url={pageUrl} title={h1} />
      </div>

      <LocationHubSessionDepth location={location} slug={slug} />

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl space-y-10 px-4">
          <SeoInternalLinksBlock
            title="Hub navigation"
            className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-6"
          />
          <RelatedLinks placement="location" currentLocationSlug={slug} />
        </div>
      </section>

      <section className="bg-zinc-900 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Book cleaning in {location.name}</h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-300">
          {location.city}-wide coverage with suburb-aware quoting—confirm your total before you pay.
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm text-zinc-400">{locationFooterCtaMicrocopy(location)}</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <SeoHubGrowthCtaLink
            href={bookingDetailsHref}
            source={`seo_loc_${slug}_footer`}
            ctx={seoCtx}
            ctaLocation="footer"
            ctaLabel={bookCtaLabel}
            ctaKind="book_now"
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-zinc-900 transition hover:bg-zinc-100"
          >
            {bookCtaLabel}
          </SeoHubGrowthCtaLink>
          <SeoHubGrowthCtaLink
            href={bookingStartHref}
            source={`seo_loc_${slug}_footer_book_now`}
            ctx={seoCtx}
            ctaLocation="footer"
            ctaLabel="Book now — slots update live"
            ctaKind="book_now"
            className="inline-flex min-h-12 items-center rounded-xl border border-zinc-500 px-6 text-base font-semibold text-white transition hover:bg-zinc-800"
          >
            Book now — slots update live
          </SeoHubGrowthCtaLink>
        </div>
      </section>

      <LocationHubEngagementClient
        trackingSlug={slug}
        stickyLine={stickyBookingLine}
        analyticsCtx={{ ...seoCtx, hub_tier: hubTier, seo_priority: seoPriority }}
      />
    </main>
  );
}
