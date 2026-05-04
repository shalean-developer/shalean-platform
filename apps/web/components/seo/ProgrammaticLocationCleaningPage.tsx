import Link from "next/link";
import { Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import { publicTrustRatingBadgeLine } from "@/lib/home/publicTrustRating";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import {
  buildLocationPageMetaDescription,
  CAPE_TOWN_SERVICE_SEO,
  type LocationSeoBlock,
} from "@/lib/seo/capeTownSeoPages";
import { GOOGLE_BUSINESS_REVIEWS, googleBusinessAggregateRatingSchema } from "@/lib/seo/googleReviews";
import { defaultLocationFaqs, nearbyProgrammaticLocations } from "@/lib/seo/locations";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  location: CapeTownLocationRow;
  seo: LocationSeoBlock | null;
  trustStats: PublicReviewBannerStats | null;
};

const SITE_ORIGIN = "https://www.shalean.co.za";

const STANDARD_SERVICE = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
const DEEP_SERVICE = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const MOVE_OUT_SERVICE = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;

function formatNearbyNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Editorial themes aligned with Google feedback — not attributed verbatim quotes. */
function locationCustomerVoiceBullets(loc: CapeTownLocationRow): string[] {
  const { name } = loc;
  return [
    `Straightforward quotes and punctual arrivals — patterns ${name} customers often mention alongside our ${GOOGLE_BUSINESS_REVIEWS.rating}★ Google rating.`,
    `Reviewers frequently note thorough kitchens and bathrooms—the areas ${name} homes depend on between visits.`,
    `Same-week booking slots open often; pick a time online after you lock your ${name} address and scope.`,
  ];
}

function defaultWhyChooseBullets(loc: CapeTownLocationRow): string[] {
  const { name, city } = loc;
  return [
    `Vetted, insured cleaners who understand typical ${name} homes—from apartments to freestanding houses.`,
    `Clear scope and pricing online before we dispatch; no surprise surcharges for what you selected.`,
    `Easy booking with human support if access codes, parking, or pets need a quick update in ${city}.`,
    `Trusted by households across ${city}; ratings reflect real visits booked through Shalean.`,
  ];
}

function locationIntroParagraphs(loc: CapeTownLocationRow): string[] {
  const { name, city, region } = loc;
  const trust =
    "Shalean connects you with vetted, insured cleaners and shows a clear total before you confirm—no surprise surcharges for the scope you select.";
  const isAtlantic = region.toLowerCase().includes("atlantic");
  const isCityBowl = region.toLowerCase().includes("city bowl");
  if (isAtlantic) {
    return [
      `${name} sits on Cape Town’s ${region}: apartments, sea air, and tight schedules. ${trust}`,
      `Book for your ${name} address in ${city}—we factor building access, lifts, and the service tier you choose so teams arrive prepared.`,
    ];
  }
  if (isCityBowl) {
    return [
      `${name} is part of ${city}’s ${region}: compact flats, walkable streets, and busy weeks where kitchens and bathrooms need dependable resets. ${trust}`,
      `Tell us your ${name} building access and room count at checkout—quotes stay accurate for ${city} denser layouts and mixed-use blocks.`,
    ];
  }
  return [
    `${name} is a ${region} neighbourhood in ${city}: family homes, rentals, and busy weeknights that add up between professional visits. ${trust}`,
    `Whether you need upkeep or a deeper reset, enter your ${name} street and room count at checkout so ${city} pricing stays accurate for your home.`,
  ];
}

export function ProgrammaticLocationCleaningPage({ location, seo, trustStats }: Props) {
  const slug = location.slug;
  const h1 = seo?.h1 ?? `Cleaning Services in ${location.name}`;
  const intro = seo?.intro?.length ? seo.intro : locationIntroParagraphs(location);
  const nearby = nearbyProgrammaticLocations(slug, 6);
  const nearbyNamesForCopy = nearby.map((l) => l.name);
  const nearbyListSentence = formatNearbyNames(nearbyNamesForCopy);
  const faqs = seo?.faqs?.length ? seo.faqs : defaultLocationFaqs(location.name, location.city);
  const eyebrow = `${location.city} · ${location.region}`;
  const bookCtaLabel = `Book a cleaner in ${location.name}`;

  const pageUrl = `${SITE_ORIGIN}/locations/${slug}`;
  const locationsIndexUrl = `${SITE_ORIGIN}/locations`;
  const webDescription = seo?.description ?? buildLocationPageMetaDescription(location.name);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        name: h1,
        description: webDescription,
        url: pageUrl,
        isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE_ORIGIN },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Locations", item: locationsIndexUrl },
          { "@type": "ListItem", position: 3, name: location.name, item: pageUrl },
        ],
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: `House Cleaning in ${location.name}`,
        areaServed: { "@type": "Place", name: `${location.name}, ${location.city}` },
        provider: {
          "@type": "LocalBusiness",
          name: "Shalean Cleaning Services",
          url: SITE_ORIGIN,
          telephone: CUSTOMER_SUPPORT_TELEPHONE_E164,
          aggregateRating: googleBusinessAggregateRatingSchema(),
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  const whyChooseItems = seo?.whyChoose?.length ? seo.whyChoose : defaultWhyChooseBullets(location);

  return (
    <main className="bg-white text-zinc-900">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_location", slug }} />
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
      </div>

      <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/60 via-white to-white py-14">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{h1}</h1>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-zinc-600">
            {intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-5 border-l-4 border-emerald-200 pl-4 text-base font-medium leading-relaxed text-zinc-800">
            {location.uniqueContextLine}
          </p>
          <p className="mt-5 text-base leading-relaxed text-zinc-700">
            We help families, professionals, and Airbnb hosts in {location.name}, {location.city}, with vetted cleaners
            and transparent online quoting—tell us your address and room count so your total is clear before you
            confirm.
          </p>
          <p className="mt-4 text-sm font-medium text-zinc-700">
            {publicTrustRatingBadgeLine(trustStats)} · Thousands of Cape Town cleans completed through Shalean
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <GrowthCtaLink
              href="/booking/details"
              source={`seo_loc_${slug}_hero`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {bookCtaLabel}
            </GrowthCtaLink>
            <GrowthCtaLink
              href="/booking"
              source={`seo_loc_${slug}_book_now`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-6 text-base font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
            >
              Book now
            </GrowthCtaLink>
          </div>
        </div>
      </section>

      {seo?.localAngle?.length ? (
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

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Services available in {location.name}</h2>
          <p className="mt-3 text-base text-zinc-600">
            Open a Cape Town-wide guide, enter your {location.name} address at checkout, and lock scope before we
            dispatch.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            <li>
              <Link
                href={STANDARD_SERVICE}
                className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                Standard cleaning
              </Link>
            </li>
            <li>
              <Link
                href={DEEP_SERVICE}
                className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                Deep cleaning
              </Link>
            </li>
            <li>
              <Link
                href={MOVE_OUT_SERVICE}
                className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                Move-out cleaning
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-sm text-zinc-600">
            More guides:{" "}
            <Link href="/services" className={linkEmphasisClassName}>
              all Cape Town cleaning services
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">What customers say in {location.name}</h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Customers in {location.name} book Shalean for recurring and deep cleans. On Google we hold a{" "}
            {GOOGLE_BUSINESS_REVIEWS.rating}★ rating from {GOOGLE_BUSINESS_REVIEWS.count} reviews — here are themes people
            highlight again and again (summaries, not verbatim quotes):
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

      <section className="border-b border-zinc-100 bg-zinc-50/50 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Nearby areas we serve</h2>
          {nearbyListSentence ? (
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              We also provide cleaning services in nearby areas such as {nearbyListSentence}. Each hub explains local
              access and links to the same Cape Town-wide service guides you can book for your street.
            </p>
          ) : (
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Explore other {location.city} suburb hubs—each page is tailored to {location.region} demand and links to
              booking with transparent quoting.
            </p>
          )}
          <ul className="mt-6 flex flex-wrap gap-2">
            {nearby.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={`/locations/${loc.slug}`}
                  className="inline-flex max-w-full rounded-full border border-zinc-200 bg-white px-4 py-2 text-left text-sm font-medium leading-snug text-zinc-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-900"
                >
                  Cleaning {loc.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Frequently Asked Questions</h2>
          <p className="mt-2 text-sm text-zinc-600">Common questions about booking cleaning in {location.name}.</p>
          <dl className="mt-8 space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <dt className="text-base font-semibold text-zinc-900">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <RelatedLinks placement="location" currentLocationSlug={slug} />
        </div>
      </section>

      <section className="bg-zinc-900 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Book cleaning in {location.name}</h2>
        <p className="mx-auto mt-3 max-w-lg text-zinc-300">
          {location.city}-wide coverage with suburb-aware quoting—confirm your total before you pay.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <GrowthCtaLink
            href="/booking/details"
            source={`seo_loc_${slug}_footer`}
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-zinc-900 transition hover:bg-zinc-100"
          >
            {bookCtaLabel}
          </GrowthCtaLink>
          <GrowthCtaLink
            href="/booking"
            source={`seo_loc_${slug}_footer_book_now`}
            className="inline-flex min-h-12 items-center rounded-xl border border-zinc-500 px-6 text-base font-semibold text-white transition hover:bg-zinc-800"
          >
            Book now
          </GrowthCtaLink>
        </div>
      </section>
    </main>
  );
}
