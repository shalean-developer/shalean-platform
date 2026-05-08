import Image from "next/image";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { getAreaProgrammaticBlogLinksForCapeTownService } from "@/lib/blog/programmaticPosts";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { AirbnbCapeTownServiceExtendedContent } from "@/components/seo/AirbnbCapeTownServiceExtendedContent";
import {
  WindowCleaningPricingTrustSection,
  WindowCleaningServiceTypesSection,
} from "@/components/seo/WindowCapeTownServiceExtendedContent";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { ServicePageCommercialIntentSection } from "@/components/seo/ServicePageCommercialIntentSection";
import { StandardCleaningCapeTownEnhancements } from "@/components/seo/StandardCleaningCapeTownEnhancements";
import { SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES, resolveCapeTownServiceSchemaFields } from "@/lib/seo/capeTownSeoPages";
import {
  getSecondaryEditorialBlogLink,
  getServicePagePricingBlogInlineLink,
  partitionServiceHubLocationLinks,
  servicePageExtraLocationSentenceLinks,
} from "@/lib/seo/internalLinks";
import { googleBusinessAggregateRatingSchema, googleReviewsServiceTrustLine } from "@/lib/seo/googleReviews";
import {
  dedupeFaqsByQuestion,
  STANDARD_CLEANING_SNIPPET_FAQS,
} from "@/lib/seo/standardCleaningMoneyPageFaqs";
import { capeTownAdministrativeServiceArea } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";
import {
  buildSeoBookingHref,
  inferBookingServiceFromSeoSlug,
  recommendedSeoExtras,
} from "@/lib/booking/seoBookingPrefill";

type Props = {
  slug: CapeTownSeoServiceSlug;
  trustStats: PublicReviewBannerStats | null;
  initialLocationSlug?: string | null;
};

function sanitizeSeoLocationSlug(slug: string | null | undefined): string | null {
  const s = slug?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9-]{2,80}$/.test(s)) return null;
  return s;
}

export function SeoCapeTownServicePage({ slug, trustStats, initialLocationSlug = null }: Props) {
  const data = CAPE_TOWN_SERVICE_SEO[slug];
  const seoService = inferBookingServiceFromSeoSlug(slug);
  const locationSlug = sanitizeSeoLocationSlug(initialLocationSlug);
  const bookingPath = buildSeoBookingHref("details", {
    service: seoService,
    locationSlug,
    extras: recommendedSeoExtras(seoService),
    source: `seo_service_${slug}`,
  });
  const bookingStartPath = buildSeoBookingHref("entry", {
    service: seoService,
    locationSlug,
    extras: recommendedSeoExtras(seoService),
    source: `seo_service_${slug}_start`,
  });
  const introHeading = data.introSectionHeading ?? "How this service works in Cape Town";
  const includedHeading = data.includedSectionHeading ?? "What's included";
  const areasHeading = data.areasSectionHeading ?? "Areas we serve in Cape Town";
  const areasIntro =
    data.areasSectionIntro ??
    "Explore suburb-focused cleaning pages across Cape Town—priority hubs below cover Sea Point, Claremont, Green Point, and Gardens, then we widen to more suburbs so crawlers and customers can move sideways without orphaning long-tail hubs.";
  const { featured: featuredHubLinks, other: otherHubLinks } = partitionServiceHubLocationLinks(slug);
  const secondaryHubLinks = otherHubLinks.slice(0, 8);
  const areasPillLinks = [...featuredHubLinks, ...secondaryHubLinks];
  const areasShownHrefs = new Set(areasPillLinks.map((l) => l.href));
  const areasSentenceLinks = servicePageExtraLocationSentenceLinks(areasShownHrefs);
  const areaProgrammaticBlogLinks = getAreaProgrammaticBlogLinksForCapeTownService(slug);
  const pricingBlogInline = getServicePagePricingBlogInlineLink(slug);
  const secondaryEditorialBlog = getSecondaryEditorialBlogLink(slug);

  const heroTrustStrip =
    slug === "standard-cleaning-cape-town" ? (
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold tracking-tight text-zinc-800">
        <span>From R250</span>
        <span className="hidden text-zinc-300 sm:inline" aria-hidden>
          ·
        </span>
        <span>Same-day booking</span>
        <span className="hidden text-zinc-300 sm:inline" aria-hidden>
          ·
        </span>
        <span>Trusted local cleaners</span>
      </p>
    ) : null;

  const heroCopy = (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{data.h1}</h1>
      {heroTrustStrip}
      <p className="mt-4 text-lg leading-relaxed text-zinc-600">{data.description}</p>
      {slug === "standard-cleaning-cape-town" ? (
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Looking for <strong className="font-semibold text-zinc-800">cleaning services near you in Cape Town</strong>? Book
          online with upfront pricing and visible availability.
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <GrowthCtaLink
          href={bookingPath}
          source={`seo_ct_${slug}_hero`}
          className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          {slug === "airbnb-cleaning-cape-town" ? "Book Airbnb cleaner" : `Book ${data.bookingLabel}`}
        </GrowthCtaLink>
        <SafeInternalLink
          href="#included"
          className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          What&apos;s included
        </SafeInternalLink>
      </div>
    </>
  );

  const pageUrl = absoluteCanonicalUrl(data.path);
  const localBusinessId = `${SITE_ORIGIN}/#localbusiness`;
  const serviceNodeId = `${pageUrl}#service`;
  const { schemaName, schemaServiceType } = resolveCapeTownServiceSchemaFields(slug, data);
  const sameAs = getBrandSameAsForJsonLd();

  const localBusinessNode: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": localBusinessId,
    name: "Shalean Cleaning Services",
    url: SITE_ORIGIN,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Cape Town",
      addressCountry: "ZA",
    },
  };
  if (sameAs.length > 0) localBusinessNode.sameAs = sameAs;

  if (slug === "standard-cleaning-cape-town") {
    localBusinessNode.aggregateRating = trustStats
      ? {
          "@type": "AggregateRating",
          ratingValue: String(Math.round(trustStats.avgRating * 10) / 10),
          reviewCount: String(trustStats.reviewCount),
        }
      : googleBusinessAggregateRatingSchema();
  }

  const mergedStandardFaqs =
    slug === "standard-cleaning-cape-town"
      ? dedupeFaqsByQuestion(STANDARD_CLEANING_SNIPPET_FAQS, data.faqs)
      : null;

  const breadcrumbEntity = {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumbs`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: "Services", item: absoluteCanonicalUrl("/services") },
      { "@type": "ListItem", position: 3, name: data.h1, item: pageUrl },
    ],
  };

  const faqSchemaSource = mergedStandardFaqs ?? data.faqs;
  const faqPageEntity = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    mainEntity: faqSchemaSource.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };

  /** Commercial Service + Offer on money page — price signals alongside CleaningService + FAQ + breadcrumbs. */
  const commercialCleaningServiceOffer =
    slug === "standard-cleaning-cape-town"
      ? ({
          "@type": "Service",
          "@id": `${pageUrl}#cleaning-services-commercial`,
          name: "Cleaning Services Cape Town",
          url: pageUrl,
          areaServed: { "@type": "City", name: "Cape Town" },
          provider: { "@id": localBusinessId },
          offers: {
            "@type": "Offer",
            priceCurrency: "ZAR",
            lowPrice: "250",
            highPrice: "600",
            availability: "https://schema.org/InStock",
          },
        } as Record<string, unknown>)
      : null;

  /** aggregateRating on money page uses verified GBP aggregate or live review RPC stats when present. */
  const jsonLdGraph: Record<string, unknown>[] = [
    localBusinessNode,
    {
      "@type": "CleaningService",
      "@id": serviceNodeId,
      name: schemaName,
      serviceType: schemaServiceType,
      url: pageUrl,
      areaServed: { "@type": "Place", name: "Cape Town, South Africa" },
      serviceArea: capeTownAdministrativeServiceArea(),
      provider: { "@id": localBusinessId },
    },
    ...(commercialCleaningServiceOffer ? [commercialCleaningServiceOffer] : []),
    breadcrumbEntity,
    faqPageEntity,
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": jsonLdGraph,
  };

  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  const deepPath = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveOutPath = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const greenPointPath = LOCATION_SEO_PAGES["green-point-cleaning-services"].path;

  return (
    <main
      className={`bg-white text-zinc-900${slug === "standard-cleaning-cape-town" ? " pb-24 md:pb-0" : ""}`}
    >
      <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "seo_cape_town_service", slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />

      <div className="mx-auto max-w-7xl px-4 pt-8">
        <SeoBreadcrumbs
          includeJsonLd={false}
          items={[
            { name: "Home", href: "/" },
            { name: "Services", href: "/services" },
            { name: data.h1, href: data.path, current: true },
          ]}
        />
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-blue-900/90">{googleReviewsServiceTrustLine()}</p>
      </div>

      <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white py-14">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-x-10">
            <div className="min-w-0 max-w-2xl lg:max-w-none">{heroCopy}</div>
            <div className="relative aspect-[4/3] w-full min-h-0 min-w-0 overflow-hidden rounded-2xl shadow-lg">
              <Image
                src={data.heroImage.src}
                alt={data.heroImage.alt}
                fill
                className="z-0 object-cover"
                sizes="(max-width: 1024px) 100vw, (max-width: 1280px) 50vw, 704px"
                priority
                fetchPriority="high"
              />
              <div
                className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-gradient-to-t from-black/20 to-transparent"
                aria-hidden
              />
              <div className="absolute bottom-2.5 left-2.5 z-[2] rounded-xl bg-white px-3 py-1.5 shadow-lg sm:bottom-4 sm:left-4 sm:px-4 sm:py-2">
                <p className="text-xs font-semibold leading-snug text-zinc-900 sm:text-sm">4,500+ Homes Cleaned</p>
                <p className="mt-0.5 text-[10px] leading-snug text-gray-500 sm:text-xs">
                  {publicTrustRatingBadgeLine(trustStats)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {slug === "standard-cleaning-cape-town" ? (
        <section className="border-b border-blue-100 bg-blue-50/25 py-12" aria-labelledby="std-trust-block-heading">
          <div className="mx-auto max-w-4xl px-4">
            <h2 id="std-trust-block-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
              Trusted cleaning services in Cape Town
            </h2>
            <ul className="mt-6 grid gap-4 text-base leading-relaxed text-zinc-700 sm:grid-cols-2">
              <li className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  <strong className="font-semibold text-zinc-900">Vetted cleaners</strong> — identity-checked professionals on
                  every visit.
                </span>
              </li>
              <li className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  <strong className="font-semibold text-zinc-900">4,500+ homes cleaned</strong> — proven volume across the
                  metro.
                </span>
              </li>
              <li className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  <strong className="font-semibold text-zinc-900">Suburb coverage</strong> — Seaboard, City Bowl, Southern
                  Suburbs, and beyond.
                </span>
              </li>
              <li className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  <strong className="font-semibold text-zinc-900">Repeat bookings &amp; reviews</strong> — customers come back
                  when schedules stick.
                </span>
              </li>
            </ul>
          </div>
        </section>
      ) : null}

      {slug === "standard-cleaning-cape-town" ? <StandardCleaningCapeTownEnhancements bookingPath={bookingPath} /> : null}

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{introHeading}</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            {slug === "standard-cleaning-cape-town" ? (
              <p>
                If you&apos;re looking for reliable{" "}
                <SafeInternalLink href="#included" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  cleaning services in Cape Town
                </SafeInternalLink>
                , Shalean matches you with vetted cleaners and a checklist you confirm online—ideal for busy households that
                want predictable maintenance between deeper resets. If you need a more intensive service, see our{" "}
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  deep cleaning services in Cape Town
                </SafeInternalLink>
                .
              </p>
            ) : null}
            {data.explanation.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p>
              <SafeInternalLink
                href="/cleaning-prices-cape-town"
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                See our cleaning prices in Cape Town
              </SafeInternalLink>{" "}
              before you book — or read{" "}
              <SafeInternalLink href={pricingBlogInline.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                {pricingBlogInline.anchor}
              </SafeInternalLink>{" "}
              on the blog.
            </p>
            <p>
              Need scope clarity first? Read{" "}
              <SafeInternalLink href={secondaryEditorialBlog.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                {secondaryEditorialBlog.anchor}
              </SafeInternalLink>
              .
            </p>
            {slug === "deep-cleaning-cape-town" ? (
              <p>
                Hosting short-stay guests? Our{" "}
                <SafeInternalLink href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Airbnb turnover cleaning
                </SafeInternalLink>{" "}
                scope is tuned for tight changeovers—deep cleans still matter when ovens and grout lag behind turnover cycles.
              </p>
            ) : null}
            {slug === "deep-cleaning-cape-town" ? (
              <p>
                Cleaning along the Atlantic Seaboard? Compare{" "}
                <SafeInternalLink
                  href={LOCATION_SEO_PAGES["sea-point-cleaning-services"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  cleaning services in Sea Point
                </SafeInternalLink>{" "}
                for salt-air buildup, compact apartments, and rental-heavy streets—then lock bedrooms, bathrooms, and add-ons
                for your deep clean online.
              </p>
            ) : null}
            {slug === "standard-cleaning-cape-town" ? (
              <p>
                If you list on Airbnb, compare dedicated{" "}
                <SafeInternalLink href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  airbnb cleaning Cape Town
                </SafeInternalLink>{" "}
                turnovers alongside recurring standard visits—guest expectations are closer to hospitality than weekly home upkeep.
              </p>
            ) : null}
            {slug === "standard-cleaning-cape-town" ? (
              <p>
                For ongoing weekly cleaning, see our{" "}
                <SafeInternalLink href="/maid-services-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  maid services in Cape Town
                </SafeInternalLink>
                .
              </p>
            ) : null}
            {slug === "airbnb-cleaning-cape-town" ? (
              <p>
                We also offer{" "}
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  window cleaning in Cape Town
                </SafeInternalLink>{" "}
                for apartments and balconies.
              </p>
            ) : null}
            {slug === "airbnb-cleaning-cape-town" ? (
              <p>
                Hosting near the Promenade or Main Road corridor? Read our{" "}
                <SafeInternalLink
                  href={LOCATION_SEO_PAGES["sea-point-cleaning-services"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  cleaning services in Sea Point
                </SafeInternalLink>{" "}
                hub for turnover pacing, parking, and guest-ready presentation alongside this Cape Town-wide Airbnb scope.
              </p>
            ) : null}
            {slug === "airbnb-cleaning-cape-town" ? (
              <p>
                Running a listing in Green Point? Read{" "}
                <SafeInternalLink
                  href="/blog/cleaning-services-green-point-cape-town"
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  Airbnb cleaning in Green Point
                </SafeInternalLink>
                —pricing, same-day turnovers, and guest-ready standards for STR hosts.
              </p>
            ) : null}
            {slug === "move-out-cleaning-cape-town" ? (
              <p>
                Need a heavier reset before handover? Compare our{" "}
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  deep cleaning services
                </SafeInternalLink>
                ,{" "}
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  airbnb cleaning
                </SafeInternalLink>{" "}
                for turnovers, and dedicated{" "}
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  window cleaning services
                </SafeInternalLink>{" "}
                when glass needs a polish for inspection photos.
              </p>
            ) : null}
            {data.neighbourhoodBlogGuide ? (
              <p>
                Looking for cleaning services in {data.neighbourhoodBlogGuide.areaName}? See our full area guide:{" "}
                <SafeInternalLink
                  href={data.neighbourhoodBlogGuide.blogPath}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  {data.neighbourhoodBlogGuide.linkAnchorText}
                </SafeInternalLink>
                .
              </p>
            ) : null}
            {data.extraNeighbourhoodBlogGuides?.map((g) => (
              <p key={g.blogPath}>
                For {g.areaName}-specific cleaning guidance, read{" "}
                <SafeInternalLink href={g.blogPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  {g.linkAnchorText}
                </SafeInternalLink>
                .
              </p>
            ))}
          </div>
        </div>
      </section>

      <ServicePageCommercialIntentSection slug={slug} />

      {slug === "window-cleaning-cape-town" ? <WindowCleaningServiceTypesSection /> : null}

      <section id="included" className="scroll-mt-24 border-b border-blue-100 bg-blue-50/40 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{includedHeading}</h2>
          <p className="mt-3 text-zinc-600">Exact scope follows your online quote—below is the typical checklist for this service type.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {data.included.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-sm font-medium text-zinc-700 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {slug === "move-out-cleaning-cape-town" ? (
        <section className="border-b border-blue-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Move Out Cleaning Prices in Cape Town</h2>
            <p className="mt-3 font-medium text-zinc-900">Pricing depends on:</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-600">
              <li>Property size</li>
              <li>Level of dirt</li>
              <li>Additional services (carpet, upholstery, windows)</li>
            </ul>
            <p className="mt-6 text-base leading-relaxed text-zinc-600">
              Get an instant quote online or book a cleaner in minutes.
            </p>
            <div className="mt-6">
              <GrowthCtaLink
                href={bookingPath}
                source={`seo_ct_${slug}_pricing_instant_price`}
                className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Get instant price
              </GrowthCtaLink>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            {slug === "standard-cleaning-cape-town" ? "Why choose Shalean cleaning services" : "Benefits for Cape Town customers"}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {data.benefits.map((b) => (
              <div key={b.title} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <Sparkles className="h-6 w-6 text-blue-600" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {slug === "standard-cleaning-cape-town" ? (
        <section className="border-b border-blue-100 py-16" aria-labelledby="std-compare-deep-heading">
          <div className="mx-auto max-w-4xl space-y-14 px-4">
            <div>
              <h2 id="std-compare-deep-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
                Standard vs deep cleaning in Cape Town
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                <strong className="text-zinc-800">Standard cleaning</strong> maintains kitchens, bathrooms, floors, and dusting on
                a predictable rhythm—best when your home needs steady upkeep rather than a heavy reset.
              </p>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                <strong className="text-zinc-800">Deep cleaning</strong> spends extra time on build-up—grout lines, appliance
                fronts, detail zones—and usually costs more because visits run longer. Book deep when you&apos;re recovering from
                hosting, moving in, or skipping cleans for a while.
              </p>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                Compare full scope on our{" "}
                <SafeInternalLink href={deepPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  deep cleaning services in Cape Town
                </SafeInternalLink>{" "}
                page, then align bedrooms and bathrooms in the quote builder.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900">One-off vs recurring cleaning</h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                <strong className="text-zinc-800">Once-off standard cleans</strong> suit move-ins, guest arrivals, or catching up
                between busy weeks—no commitment to a schedule.
              </p>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                <strong className="text-zinc-800">Recurring visits</strong> (weekly, bi-weekly, or monthly) keep mess from
                compounding and often cost less per session because maintenance is lighter. For domestic rhythm and maid-style
                cadence copy, see{" "}
                <SafeInternalLink href="/maid-services-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  maid services in Cape Town
                </SafeInternalLink>
                .
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Popular services &amp; hubs</h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                Explore{" "}
                <SafeInternalLink href={deepPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  deep cleaning services in Cape Town
                </SafeInternalLink>
                ,{" "}
                <SafeInternalLink href={moveOutPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  move out cleaning in Cape Town
                </SafeInternalLink>
                , and our{" "}
                <SafeInternalLink href="/cleaning-prices-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  cleaning prices in Cape Town
                </SafeInternalLink>{" "}
                hub. Browse priority suburbs like{" "}
                <SafeInternalLink href={LOCATION_SEO_PAGES["sea-point-cleaning-services"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Sea Point cleaning services
                </SafeInternalLink>
                ,{" "}
                <SafeInternalLink href={LOCATION_SEO_PAGES["claremont-cleaning-services"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Claremont
                </SafeInternalLink>
                , and{" "}
                <SafeInternalLink href={greenPointPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Green Point cleaning services
                </SafeInternalLink>
                .
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {data.targetAudience ? (
        <section className="border-b border-blue-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{data.targetAudience.heading}</h2>
            <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
              {data.targetAudience.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {slug === "window-cleaning-cape-town" ? <WindowCleaningPricingTrustSection bookingPath={bookingPath} /> : null}

      {slug === "airbnb-cleaning-cape-town" ? (
        <AirbnbCapeTownServiceExtendedContent bookingPath={bookingPath} />
      ) : null}

      <section className="border-b border-blue-100 bg-blue-50/30 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            <MapPin className="h-6 w-6 text-blue-600" aria-hidden />
            {areasHeading}
          </h2>
          <p className="mt-3 text-zinc-600">{areasIntro}</p>
          {slug === "standard-cleaning-cape-town" ? (
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              High-demand hubs include{" "}
              <SafeInternalLink
                href={LOCATION_SEO_PAGES["sea-point-cleaning-services"].path}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                cleaning services in Sea Point
              </SafeInternalLink>
              ,{" "}
              <SafeInternalLink
                href={LOCATION_SEO_PAGES["claremont-cleaning-services"].path}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                Claremont cleaning services
              </SafeInternalLink>
              , and{" "}
              <SafeInternalLink
                href={LOCATION_SEO_PAGES["observatory-cleaning-services"].path}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                Observatory cleaning services
              </SafeInternalLink>{" "}
              —each page adds typical layouts, parking, and short-stay context before you book.
            </p>
          ) : null}
          {slug === "standard-cleaning-cape-town" ? (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  <SafeInternalLink href={LOCATION_SEO_PAGES["sea-point-cleaning-services"].path} className="text-blue-800 hover:underline">
                    Sea Point
                  </SafeInternalLink>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  High-rise apartments, Airbnb turnovers, and coastal dust along the Promenade and Main Road—fast access notes for
                  lifts and parking before you book.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  <SafeInternalLink href={LOCATION_SEO_PAGES["claremont-cleaning-services"].path} className="text-blue-800 hover:underline">
                    Claremont
                  </SafeInternalLink>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Family homes, townhouses, and student-adjacent rentals—good mix of weekly upkeep and deeper seasonal resets near
                  schools and malls.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  <SafeInternalLink href={LOCATION_SEO_PAGES["observatory-cleaning-services"].path} className="text-blue-800 hover:underline">
                    Observatory
                  </SafeInternalLink>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Shared houses and compact flats with frequent move-outs—ideal for flexible once-offs or tighter recurring scopes.
                </p>
              </div>
            </div>
          ) : null}
          {featuredHubLinks.length >= 2 &&
          slug !== "window-cleaning-cape-town" &&
          slug !== "airbnb-cleaning-cape-town" ? (
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              Looking for {data.bookingLabel} with suburb-specific context? We serve{" "}
              <SafeInternalLink
                href={featuredHubLinks[0]!.href}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                {featuredHubLinks[0]!.label}
              </SafeInternalLink>{" "}
              and{" "}
              <SafeInternalLink
                href={featuredHubLinks[1]!.href}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                {featuredHubLinks[1]!.label}
              </SafeInternalLink>{" "}
              alongside the rest of the Cape Town network—open a hub for parking, access, and layout notes before you
              book.
            </p>
          ) : null}
          {slug === "window-cleaning-cape-town" ? (
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Popular hubs for glass work:{" "}
              <SafeInternalLink
                href="/locations/sea-point-cleaning-services"
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                window cleaning in Sea Point
              </SafeInternalLink>
              ,{" "}
              <SafeInternalLink
                href="/locations/green-point-cleaning-services"
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                window cleaning in Green Point
              </SafeInternalLink>
              , and{" "}
              <SafeInternalLink
                href="/locations/claremont-cleaning-services"
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                window cleaning in Claremont
              </SafeInternalLink>
              —each location page adds parking and access context before you book.
            </p>
          ) : null}
          <ul className="mt-8 flex flex-wrap gap-3">
            {areasPillLinks.map((loc) => (
              <li key={loc.href}>
                <SafeInternalLink
                  href={loc.href}
                  className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
                >
                  {loc.label}
                </SafeInternalLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            Explore more suburb hubs for parking, building access, and typical layouts
            {areasSentenceLinks.length > 0 ? (
              <>
                —start with{" "}
                {areasSentenceLinks.map((l, i, arr) => (
                  <span key={l.href}>
                    {i > 0 ? (i === arr.length - 1 ? ", or " : ", ") : null}
                    <SafeInternalLink href={l.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                      {l.label}
                    </SafeInternalLink>
                  </span>
                ))}
                , or browse{" "}
              </>
            ) : (
              <>—browse{" "}</>
            )}
            <SafeInternalLink href="/locations" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              all Cape Town cleaning locations
            </SafeInternalLink>
            .
          </p>
        </div>
      </section>

      {slug !== "standard-cleaning-cape-town" ? (
        <section id="faqs" className="scroll-mt-24 border-b border-blue-100 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Frequently asked questions</h2>
            <p className="mt-3 text-zinc-600">
              Straight answers about booking, scope, and what to expect for this service in Cape Town.
            </p>
            <div className="mt-8 space-y-5">
              {data.faqs.map((faq) => (
                <div key={faq.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="border-b border-blue-100 py-16" aria-labelledby="std-more-faq-heading">
          <div className="mx-auto max-w-4xl px-4">
            <h2 id="std-more-faq-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
              Booking &amp; scope details
            </h2>
            <p className="mt-3 text-zinc-600">
              More answers on recurring visits, supplies, and upgrading scope—snippet-focused FAQs live{" "}
              <SafeInternalLink href="#faqs" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                under pricing above
              </SafeInternalLink>
              .
            </p>
            <div className="mt-8 space-y-5">
              {data.faqs.map((faq) => (
                <div key={faq.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {areaProgrammaticBlogLinks ? (
        <section className="border-b border-blue-100 bg-blue-50/30 py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Cleaning Services by Area in Cape Town</h2>
            <ul className="mt-8 flex flex-wrap gap-3">
              {areaProgrammaticBlogLinks.map((item) => (
                <li key={item.href}>
                  <SafeInternalLink
                    href={item.href}
                    className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
                  >
                    {item.label}
                  </SafeInternalLink>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl space-y-10 px-4">
          <SeoInternalLinksBlock
            title="Hub navigation"
            className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-6"
          />
          <RelatedLinks placement="service" currentServiceSlug={slug} />
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">
          {slug === "standard-cleaning-cape-town"
            ? "Book a cleaner in Cape Town today"
            : slug === "move-out-cleaning-cape-town"
              ? "Ready to move out stress-free?"
              : `Ready to book ${data.bookingLabel}?`}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">
          {slug === "standard-cleaning-cape-town"
            ? "Same-day and next-day slots when routing allows—lock bedrooms, bathrooms, and add-ons in one transparent total."
            : slug === "move-out-cleaning-cape-town"
              ? "Book your move out cleaning today and leave your property spotless."
              : "Get an instant price for your Cape Town address, bedrooms, and bathrooms—then choose a time that works."}
        </p>
        <div className="mx-auto mt-6 flex flex-wrap justify-center gap-3">
          <GrowthCtaLink
            href={bookingPath}
            source={`seo_ct_${slug}_footer`}
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            {slug === "airbnb-cleaning-cape-town"
              ? "Book Airbnb cleaner"
              : slug === "window-cleaning-cape-town"
                ? "Book window cleaning"
                : slug === "move-out-cleaning-cape-town"
                  ? "Book cleaning"
                  : slug === "standard-cleaning-cape-town"
                    ? "Get instant quote"
                    : "Start booking"}
          </GrowthCtaLink>
          {slug === "airbnb-cleaning-cape-town" || slug === "window-cleaning-cape-town" ? (
            <>
              <GrowthCtaLink
                href={bookingPath}
                source={`seo_ct_${slug}_footer_price`}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
              >
                Get instant price
              </GrowthCtaLink>
              <GrowthCtaLink
                href={bookingPath}
                source={`seo_ct_${slug}_footer_avail`}
                className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
              >
                Check availability
              </GrowthCtaLink>
            </>
          ) : null}
          {slug === "move-out-cleaning-cape-town" ? (
            <GrowthCtaLink
              href={bookingPath}
              source={`seo_ct_${slug}_footer_price`}
              className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
            >
              Get instant price
            </GrowthCtaLink>
          ) : null}
        </div>
      </section>

      {slug === "standard-cleaning-cape-town" ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-blue-200 bg-white/95 backdrop-blur-sm md:hidden">
          <div className="mx-auto flex max-w-lg gap-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_standard-cleaning-cape-town_sticky_quote"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
            >
              Book now
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookingStartPath}
              source="seo_ct_standard-cleaning-cape-town_sticky_book"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-blue-200 bg-white text-sm font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Start booking
            </GrowthCtaLink>
          </div>
        </div>
      ) : null}
    </main>
  );
}
