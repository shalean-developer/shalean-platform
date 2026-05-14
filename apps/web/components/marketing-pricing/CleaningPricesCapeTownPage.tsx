import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { marketingPrimaryCtaClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { moneyPageExploreAreaHubs, moneyPageSuburbAuthorityKeywordLinks } from "@/lib/seo/moneyPageLocationClusters";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import {
  buildPrimaryLocalBusinessMoneyPageNode,
  PRIMARY_LOCAL_BUSINESS_ID,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { CLEANING_PRICES_META_DESCRIPTION } from "@/lib/seo/marketingCleaningPricesHubMeta";
import {
  buildBreadcrumbJsonLdNode,
  buildWebPageJsonLdNode,
  buildWebSiteJsonLdNode,
  jsonLdGraphDocument,
} from "@/lib/seo/schemaGraph";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";

const CANONICAL_PATH = "/cleaning-prices-cape-town";

const svc = CAPE_TOWN_SERVICE_SEO;

const popularCapeTownAreaHubs = moneyPageExploreAreaHubs();
const pricingSuburbAuthorityCluster = moneyPageSuburbAuthorityKeywordLinks();

export const CLEANING_PRICES_CAPE_TOWN_FAQS = [
  {
    idSlug: "lock-fixed-total",
    question: "How do I lock my fixed total before anyone visits?",
    answer:
      "Start Get instant quote or Book a cleaner, then enter bedrooms, bathrooms, service tier, and extras. Shalean shows the full line-item total at checkout before you confirm—that selection is what crews brief against on the day.",
  },
  {
    idSlug: "from-vs-checkout",
    question: "Do the ‘from’ prices on this page match checkout?",
    answer:
      "Tiers and home-size anchors here are entry bands for planning. Checkout reflects the exact rooms, baths, add-ons, and tier you select—the number you agree to before payment.",
  },
  {
    idSlug: "pick-tier-checkout",
    question: "Which service type should I pick at checkout?",
    answer:
      "Choose standard for occupied maintenance, deep when kitchens or wet rooms need reset dwell, and move-out for near-empty handover scope. Open each service page for checklist notes, then return to the quote builder to switch tier before you pay.",
  },
  {
    idSlug: "fixed-pricing",
    question: "Do you offer fixed pricing?",
    answer:
      "Yes. Shalean locks your price online from your selections—bedrooms, bathrooms, service type, and extras—so you see the full total before checkout. If your scope changes, you update the booking and the price updates clearly.",
  },
  {
    idSlug: "custom-quote",
    question: "Can I get a custom quote?",
    answer:
      "Office cleans, unusual layouts, and multi-day commercial schedules usually need a short custom quote—start from our office cleaning page or contact us with square metres and frequency. Homes and apartments get instant quotes via the booking flow.",
  },
] as const;

function buildPricingFaqJsonLdNode(pageUrl: string): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    isPartOf: { "@id": `${pageUrl}#webpage` },
    about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    mainEntity: CLEANING_PRICES_CAPE_TOWN_FAQS.map((item) => ({
      "@type": "Question",
      "@id": `${pageUrl}#faq-q-${item.idSlug}`,
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/** Supplementary offers by home size — supports rich-result eligibility where Google accepts OfferCatalog. */
function buildPricingOfferCatalogNode(pageUrl: string, catalogId: string): Record<string, unknown> {
  const eligibleRegion = { "@type": "Place", name: "Cape Town, South Africa" };
  const describe =
    "Indicative starting-from totals for typical standard-clean scopes in Cape Town; final price depends on service tier, bathrooms, and extras selected online.";
  return {
    "@type": "OfferCatalog",
    "@id": catalogId,
    name: "Cleaning prices by home size in Cape Town",
    url: pageUrl,
    description: describe,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Offer",
          name: "Residential cleaning — studio / 1-bedroom apartment (from)",
          description: describe,
          price: "280",
          priceCurrency: "ZAR",
          url: pageUrl,
          availability: "https://schema.org/InStock",
          eligibleRegion,
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: {
          "@type": "Offer",
          name: "Residential cleaning — 2-bedroom home (from)",
          description: describe,
          price: "350",
          priceCurrency: "ZAR",
          url: pageUrl,
          availability: "https://schema.org/InStock",
          eligibleRegion,
        },
      },
      {
        "@type": "ListItem",
        position: 3,
        item: {
          "@type": "Offer",
          name: "Residential cleaning — 3-bedroom home (from)",
          description: describe,
          price: "450",
          priceCurrency: "ZAR",
          url: pageUrl,
          availability: "https://schema.org/InStock",
          eligibleRegion,
        },
      },
      {
        "@type": "ListItem",
        position: 4,
        item: {
          "@type": "Offer",
          name: "Residential cleaning — 4+ bedroom home",
          description:
            "Custom quote in Cape Town based on bedrooms, bathrooms, property condition, and cleaning level—totals confirmed online before payment.",
          url: pageUrl,
          availability: "https://schema.org/InStock",
          eligibleRegion,
        },
      },
    ],
  };
}

function buildCleaningPricesHubJsonLd(): Record<string, unknown> {
  const pageUrl = absoluteCanonicalUrl(CANONICAL_PATH);
  const catalogId = `${pageUrl}#offer-catalog`;
  return jsonLdGraphDocument([
    buildWebSiteJsonLdNode(),
    buildWebPageJsonLdNode({
      canonicalUrl: pageUrl,
      name: "Cleaning prices in Cape Town",
      description: CLEANING_PRICES_META_DESCRIPTION,
      primaryEntityId: catalogId,
      speakableCssSelectors: ["main h1"],
    }),
    buildPrimaryLocalBusinessMoneyPageNode(),
    buildPricingOfferCatalogNode(pageUrl, catalogId),
    buildPricingFaqJsonLdNode(pageUrl),
    buildBreadcrumbJsonLdNode(pageUrl, [
      { name: "Home", url: SITE_ORIGIN },
      { name: "Cleaning prices in Cape Town", url: pageUrl },
    ]),
  ]);
}

const pricingTiers = [
  {
    name: "Standard Cleaning (Cape Town)",
    from: "R280",
    description:
      "Regular home upkeep—kitchens, bathrooms, floors, and surfaces kept guest-ready. Ideal for weekly, bi-weekly, or monthly rhythm.",
    href: svc["standard-cleaning-cape-town"].path,
    cta: "Standard cleaning services in Cape Town",
    fullBreakdownLabel: "standard cleaning services in Cape Town",
  },
  {
    name: "Deep Cleaning (Cape Town)",
    from: "R520",
    description:
      "Heavier reset for neglected areas, seasonal refreshes, or before you settle into a maintenance cadence. More time on detail zones.",
    href: svc["deep-cleaning-cape-town"].path,
    cta: "Deep cleaning services in Cape Town",
    fullBreakdownLabel: "deep cleaning services in Cape Town",
  },
  {
    name: "Move-Out Cleaning (Cape Town)",
    from: "R720",
    description:
      "Handover-focused scope for inspections and deposit peace of mind. Structured for empty or nearly empty homes.",
    href: svc["move-out-cleaning-cape-town"].path,
    cta: "Move-out cleaning services in Cape Town",
    fullBreakdownLabel: "move-out cleaning services in Cape Town",
  },
  {
    name: "Airbnb Cleaning (Cape Town)",
    from: "R320",
    description:
      "Fast turnovers between guests—reset living areas, sanitise bathrooms, kitchen polish, and presentation-ready finishing.",
    href: svc["airbnb-cleaning-cape-town"].path,
    cta: "Airbnb cleaning services in Cape Town",
    fullBreakdownLabel: "Airbnb cleaning services in Cape Town",
  },
  {
    name: "Office Cleaning (Cape Town)",
    from: "Custom quote",
    description:
      "Desks, kitchens, bathrooms, bins, and communal floors on a schedule that fits your team—priced from footprint and frequency.",
    href: svc["office-cleaning-cape-town"].path,
    cta: "Office cleaning services in Cape Town",
    fullBreakdownLabel: "office cleaning services in Cape Town",
  },
] as const;

const pricingComparisonRows = [
  { service: "Standard Cleaning", price: "R280", bestFor: "Regular maintenance" },
  { service: "Deep Cleaning", price: "R520", bestFor: "Full home reset" },
  { service: "Move-Out Cleaning", price: "R720", bestFor: "End of tenancy" },
  { service: "Airbnb Cleaning", price: "R320", bestFor: "Short-term rentals" },
] as const;

const homeSizePricingBands = [
  { label: "Studio / 1-bedroom apartment", price: "R280" },
  { label: "2-bedroom home", price: "R350" },
  { label: "3-bedroom home", price: "R450" },
  { label: "4+ bedroom home", price: "Custom quote" },
] as const;

const exampleCleaningPrices = [
  "1-bedroom apartment (standard cleaning): from R280",
  "2-bedroom apartment (deep cleaning): from R520",
  "3-bedroom house (move-out cleaning): from R720",
  "Airbnb turnover cleaning: from R320",
] as const;

type CleaningPricesCapeTownPageProps = {
  seoLocationLinks?: readonly { readonly href: string; readonly label: string }[];
};

export function CleaningPricesCapeTownPage({ seoLocationLinks = [] }: CleaningPricesCapeTownPageProps) {
  const hubJsonLd = buildCleaningPricesHubJsonLd();

  const staticHubHrefs = new Set([
    ...popularCapeTownAreaHubs.map((h) => h.href),
    ...pricingSuburbAuthorityCluster.map((l) => l.href),
  ]);
  const extraSeoLocationLinks = seoLocationLinks.filter((l) => !staticHubHrefs.has(l.href));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(hubJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Hero */}
      <section className="border-b border-slate-100 bg-white pb-12 pt-10 md:pb-16 md:pt-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
              Cleaning Prices in Cape Town
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              Cleaning prices in Cape Town vary depending on the size of your home, the type of cleaning service, and how often you
              book. House cleaning prices stay lower for routine upkeep; deep cleaning cost and move-out cleaning cost rise when
              bathrooms, buildup, or handover detail need more time. Compare the guide below, then lock your exact cleaning cost online
              before you pay.
            </p>
            <p className="mt-3 text-base leading-relaxed text-slate-700 sm:text-lg">
              Get an instant cleaning price in Cape Town based on your home size and service type — no guessing. The booking flow works
              like a price calculator: select rooms, service tier, and extras, then see your fixed total before checkout.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              For indicative session bands and how to compare quotes between providers—not a substitute for checkout—read the{" "}
              <Link
                href="/blog/how-much-does-cleaning-cost-cape-town-2026"
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                2026 Cape Town cleaning cost guide
              </Link>
              .
            </p>
            <ul className="mx-auto mt-6 max-w-lg space-y-2.5 text-left text-sm leading-relaxed text-slate-700 sm:max-w-xl sm:text-base">
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  Rated {GOOGLE_BUSINESS_REVIEWS.rating}★ from {GOOGLE_BUSINESS_REVIEWS.count}+ Google reviews — households across Cape
                  Town
                </span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>Vetted, trained cleaners</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>Secure online booking and payment</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>No long-term contracts</span>
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <GrowthCtaLink
                href="/booking/details"
                source="cleaning_prices_cta_instant_quote"
                className={marketingPrimaryCtaClassName}
              >
                Get Instant Quote
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking"
                source="cleaning_prices_cta_book_cleaner"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Book a Cleaner
              </GrowthCtaLink>
            </div>
            <div className="mx-auto mt-6 max-w-xl text-center text-sm font-medium text-slate-800 sm:text-base">
              <p>Transparent pricing. No hidden fees.</p>
              <p className="mt-1">Only pay for what you book.</p>
              <ul className="mx-auto mt-4 flex max-w-md flex-col gap-1.5 text-left text-slate-700 sm:mx-auto sm:max-w-lg">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>Instant online pricing</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>No contracts</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>Pay securely online</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing overview */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="pricing-overview-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pricing-overview-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Cleaning services prices Cape Town — at a glance
            </h2>
            <p className="mt-3 text-slate-600">
              Typical entry bands for residential bookings—including deeper resets and empty-home handovers. Office cleaning prices in
              Cape Town usually start from a short custom scope (square metres + frequency). Your live quote may vary with bedrooms,
              bathrooms, and add-ons.
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-center text-slate-600">
              Recurring plans usually cost less per visit than once-off cleans on the same home—weekly upkeep stays lighter than letting
              grease and dust compound between sporadic bookings.
            </p>
          </div>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pricingTiers.map((tier) => (
              <li
                key={tier.name}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
                  <p className="shrink-0 text-right">
                    <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">From</span>
                    <span className="text-xl font-bold text-blue-600">{tier.from}</span>
                  </p>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{tier.description}</p>
                <Link
                  href={tier.href}
                  className="mt-5 inline-flex text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  {tier.cta}
                </Link>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  For a full breakdown, see our{" "}
                  <Link href={tier.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                    {tier.fullBreakdownLabel}
                  </Link>
                  .
                </p>
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-12 max-w-4xl">
            <h3 className="text-center text-lg font-semibold text-slate-900">Compare starting prices</h3>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Comparison of Shalean cleaning services in Cape Town with starting prices and best use cases
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th scope="col" className="px-4 py-3 font-semibold text-slate-900">
                      Service
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-slate-900">
                      Starting Price
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-slate-900">
                      Best For
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pricingComparisonRows.map((row) => (
                    <tr key={row.service} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.service}</td>
                      <td className="px-4 py-3 text-blue-700 font-semibold">{row.price}</td>
                      <td className="px-4 py-3 text-slate-600">{row.bestFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-600">
            Need glass done to handover standard? Pair your booking with{" "}
            <Link href={svc["window-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              window cleaning services in Cape Town
            </Link>{" "}
            when it makes sense for your scope.
          </p>
        </div>
      </section>

      {/* Concrete examples — trust + snippet-style clarity */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16" aria-labelledby="example-prices-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="example-prices-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Example cleaning prices in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Illustrative starting bands—your live total updates when you enter bedrooms, bathrooms, and add-ons.
          </p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
            {exampleCleaningPrices.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-6 leading-relaxed text-slate-600">
            For ongoing home help, many households book{" "}
            <Link href={svc["standard-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              standard cleaning services in Cape Town
            </Link>{" "}
            weekly or bi-weekly—the rhythm people often mean when they search for maid services in Cape Town. See{" "}
            <Link href="/maid-services-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              maid services in Cape Town
            </Link>{" "}
            for recurring schedules; pricing above still applies before each visit.
          </p>
        </div>
      </section>

      {/* Popular areas — micro-location + pricing hub */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Cleaning prices in popular Cape Town areas
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Cleaning prices can vary slightly depending on your location—for example:
          </p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
            {popularCapeTownAreaHubs.map((hub) => (
              <li key={hub.href}>
                <Link
                  href={hub.href}
                  title={hub.anchor}
                  className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                >
                  {hub.label}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-10 text-lg font-semibold tracking-tight text-slate-900">Cleaning services in Cape Town suburbs:</h3>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
            {pricingSuburbAuthorityCluster.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  {link.text}
                </Link>
              </li>
            ))}
          </ul>
          {extraSeoLocationLinks.length > 0 ? (
            <>
              <h3 className="mt-10 text-lg font-semibold tracking-tight text-slate-900">More areas we serve</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
                {extraSeoLocationLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-6 leading-relaxed text-slate-600">
            Get an exact cleaning quote in Cape Town for your area:{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="cleaning_prices_popular_areas_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Get your cleaning quote
            </GrowthCtaLink>
            .
          </p>
        </div>
      </section>

      {/* Intent: why prices change */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            What affects cleaning prices in Cape Town?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            If you are asking why quotes differ—or how much cleaning should cost—these are the drivers almost every Cape Town booking
            shares:
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            <li>Size of your home (1-bedroom vs 4-bedroom)</li>
            <li>Type of cleaning (standard, deep, move-out)</li>
            <li>Condition of the property</li>
            <li>Frequency (once-off vs weekly cleaning)</li>
            <li>Location and access (travel, parking, estates)</li>
          </ul>
        </div>
      </section>

      {/* Affordable angle */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Affordable cleaning prices in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Many customers search for cheap cleaning services in Cape Town, but the best option is affordable cleaning that balances
            price and quality—you still want vetted teams, clear scope, and totals you approve before anyone arrives.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            We offer affordable cleaning services in Cape Town without compromising on quality. Our pricing is transparent and designed
            to suit different budgets—ideal if you are weighing cheap cleaning Cape Town rates against quality, or browsing affordable
            cleaning Cape Town teams for a monthly rhythm. You always see the full total before you pay.
          </p>
        </div>
      </section>

      {/* Home size — long-tail intent */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Cleaning prices by home size in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Cleaning prices in Cape Town increase based on the size of your home and the level of cleaning required. These entry bands
            assume a typical standard clean—deep cleaning, move-outs, and extras step up from here.
          </p>
          <ul className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-6 text-slate-800">
            {homeSizePricingBands.map((row) => (
              <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-4 last:border-b-0 last:pb-0">
                <span className="font-medium">{row.label}</span>
                <span className="text-lg font-semibold text-blue-700">
                  {row.price === "Custom quote" ? row.price : `from ${row.price}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-slate-600">
            Lock the price for your exact bedroom and bathroom count in{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="cleaning_prices_home_size_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              instant quote
            </GrowthCtaLink>
            —that captures 1-bedroom cleaning cost, 2-bedroom cleaning cost, and larger homes in one flow.
          </p>
        </div>
      </section>

      {/* Detailed explanation */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            How much does cleaning cost in Cape Town?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Whether you are comparing house cleaning prices in Cape Town, estimating deep cleaning cost for a reset, tallying move-out
            cleaning cost before handover, or scoping office cleaning prices for your workplace, most quotes map to the same drivers we
            listed above—just with more nuance per room. Nail bedrooms, bathrooms, service tier, and extras in the booking flow and your
            fixed price stays predictable—no surprises at the door.
          </p>
          <ul className="mt-8 space-y-6 text-slate-600">
            <li>
              <h3 className="text-lg font-semibold text-slate-900">Size of property</h3>
              <p className="mt-2 leading-relaxed">
                Bedrooms and bathrooms drive time on floors, surfaces, and sanitising. Larger homes and duplexes need longer
                runs—especially when passages, staircases, or outdoor adjoining areas add metres to mop lines.
              </p>
            </li>
            <li>
              <h3 className="text-lg font-semibold text-slate-900">Type of service</h3>
              <p className="mt-2 leading-relaxed">
                <Link href={svc["standard-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Standard cleaning services in Cape Town
                </Link>{" "}
                stay lighter and faster;{" "}
                <Link href={svc["deep-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  deep cleaning services in Cape Town
                </Link>{" "}
                allocate extra minutes to buildup;{" "}
                <Link href={svc["move-out-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  move-out cleaning services in Cape Town
                </Link>{" "}
                reflect empty-home detailing landlords photograph room by room.
              </p>
            </li>
            <li>
              <h3 className="text-lg font-semibold text-slate-900">Frequency</h3>
              <p className="mt-2 leading-relaxed">
                Weekly or bi-weekly maintenance often keeps each visit shorter than sporadic one-offs because grease, dust, and
                bathroom films do not compound. That rhythm can make recurring{" "}
                <span className="font-medium text-slate-800">cleaning services prices Cape Town</span> budgets easier to plan.
              </p>
            </li>
            <li>
              <h3 className="text-lg font-semibold text-slate-900">Extras</h3>
              <p className="mt-2 leading-relaxed">
                Interior windows, oven degrease, fridge interiors, walls in targeted rooms, or heavy balcony resets extend the
                checklist. Add them in the quote builder so your total reflects the real scope—especially alongside{" "}
                <Link href={svc["window-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  window cleaning services in Cape Town
                </Link>{" "}
                when glass is part of handover.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* Hourly */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Hourly cleaning rates in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Cleaning services in Cape Town typically range from{" "}
            <strong className="font-semibold text-slate-800">R80 to R150 per hour</strong>, depending on the type of service and the
            experience of the cleaner—hourly cleaning rate searches land here because people want a quick benchmark before they compare
            fixed packages.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            Many fixed residential bookings equate to roughly{" "}
            <strong className="font-semibold text-slate-800">R90–R140 per cleaner-hour</strong> when you divide the quoted total by
            scheduled time—the band still moves with scope, access, and extras.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            For accurate pricing, it&apos;s best to get a fixed quote based on your home:{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="cleaning_prices_hourly_instant_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Get instant quote
            </GrowthCtaLink>
            . Shalean still leads with <strong className="font-semibold text-slate-800">fixed pricing</strong> from your selections so
            you know the full cleaning cost in Cape Town before checkout. Hourly-style arrangements fit open-ended office workflows—where{" "}
            <Link href={svc["office-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              office cleaning services in Cape Town
            </Link>{" "}
            are scoped from footprint, frequency, and shared facilities.
          </p>
        </div>
      </section>

      {/* Internal linking */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Explore services &amp; scopes</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Compare what&apos;s included before you choose a tier—these pages spell out checklists, typical durations, and booking
            paths:
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            <li>
              <Link href={svc["standard-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Standard cleaning services in Cape Town
              </Link>{" "}
              — recurring house cleaning prices and maintenance scope.
            </li>
            <li>
              <Link href={svc["deep-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Deep cleaning services in Cape Town
              </Link>{" "}
              — deeper reset when kitchens, bathrooms, or dust load need more time.
            </li>
            <li>
              <Link href={svc["move-out-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Move-out cleaning services in Cape Town
              </Link>{" "}
              — deposit-focused detailing and empty-home workflows.
            </li>
            <li>
              <Link href={svc["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Airbnb cleaning services in Cape Town
              </Link>{" "}
              — guest-ready turnovers when calendars are tight.
            </li>
            <li>
              <Link href={svc["office-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Office cleaning services in Cape Town
              </Link>{" "}
              — workstations, kitchens, and washrooms on a commercial rhythm.
            </li>
            <li>
              <Link href={svc["window-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Window cleaning services in Cape Town
              </Link>{" "}
              — interior (and scope-dependent exterior) glass add-ons for sparkle and handovers.
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Cleaning prices FAQ</h2>
          <p className="mt-3 text-slate-600">Quick answers about residential and commercial cleaning costs.</p>

          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {CLEANING_PRICES_CAPE_TOWN_FAQS.map((faq) => (
              <details key={faq.idSlug} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left font-semibold text-slate-900">
                  {faq.question}
                  <span className="text-slate-400 transition group-open:rotate-180" aria-hidden>
                    ▼
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Conversion */}
      <section className="bg-white py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 px-6 py-12 text-center shadow-lg sm:px-10 md:py-14">
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Get your exact cleaning price now</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-blue-50">
              Get an instant cleaning quote in Cape Town based on your home size and service type—then book when the total looks
              right.
            </p>

            <ul className="mx-auto mt-8 flex max-w-lg flex-col gap-3 text-left text-sm text-blue-50 sm:max-w-xl">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>Instant online pricing — see your total before checkout</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>No contracts — book when you need it</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>Pay securely online</span>
              </li>
            </ul>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <GrowthCtaLink
                href="/booking/details"
                source="cleaning_prices_final_cta_quote"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                Get your exact cleaning price now
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking"
                source="cleaning_prices_final_cta_book"
                className="inline-flex items-center justify-center rounded-full border-2 border-white/80 bg-transparent px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Book a cleaner
              </GrowthCtaLink>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SeoInternalLinksBlock title="Hub navigation" className="rounded-2xl border border-slate-200 bg-slate-50/90 p-6" />
        </div>
      </section>
    </>
  );
}
