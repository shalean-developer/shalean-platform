import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { SEO_HUB_CLEANING_PRICES_PATH, SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { marketingPrimaryCtaClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { moneyPageExploreAreaHubs, moneyPageSuburbAuthorityKeywordLinks } from "@/lib/seo/moneyPageLocationClusters";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import {
  buildPrimaryLocalBusinessMoneyPageNode,
  capeTownAdministrativeServiceArea,
  PRIMARY_LOCAL_BUSINESS_ID,
  primaryLocalBusinessMoneyPageAreaServed,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { MAID_SERVICES_META_DESCRIPTION } from "@/lib/seo/marketingMaidServicesHubMeta";
import {
  buildBreadcrumbJsonLdNode,
  buildWebPageJsonLdNode,
  buildWebSiteJsonLdNode,
  jsonLdGraphDocument,
} from "@/lib/seo/schemaGraph";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";

const CANONICAL_PATH = "/maid-services-cape-town";

const svc = CAPE_TOWN_SERVICE_SEO;

const popularCapeTownAreaHubs = moneyPageExploreAreaHubs();
const maidSuburbAuthorityCluster = moneyPageSuburbAuthorityKeywordLinks();

export const MAID_SERVICES_NEAR_ME_FAQ_QUESTION = "Do you offer maid services near me in Cape Town?" as const;

export const MAID_SERVICES_CAPE_TOWN_FAQS = [
  {
    idSlug: "cost",
    question: "How much does a maid service cost in Cape Town?",
    answer:
      "Most recurring home visits fall in a similar band to standard maintenance cleaning—often from around R280–R450 per visit for typical apartments and houses, depending on bedrooms, bathrooms, and extras. Bi-weekly schedules usually land in the same range with scope adjusted for how much resets between visits. Daily domestic cleaning Cape Town schedules are priced on footprint and hours—use instant quote to see your fixed total before checkout.",
  },
  {
    idSlug: "weekly",
    question: "Can I book a weekly maid service?",
    answer:
      "Yes. Weekly is one of the most popular rhythms for maid services Cape Town households use to stay ahead of dust, kitchens, and bathrooms. Pick weekly in booking, set your home size and cleaning type, and your quote reflects that cadence.",
  },
  {
    idSlug: "contract",
    question: "Do I need to sign a contract?",
    answer:
      "No long-term contract is required for residential bookings through Shalean. You choose frequency and scope online; change or pause when your schedule shifts. That flexibility is core to how we deliver home maid service Cape Town customers can rely on without lock-in.",
  },
  {
    idSlug: "included",
    question: "What is included in maid services?",
    answer:
      "Maid services focus on maintenance cleaning—floors, surfaces, kitchens, bathrooms, and general tidy-up suited to your booked tier—not the heavy reset of a once-off deep clean unless you select that service type. Think recurring domestic help that keeps your home consistently guest-ready. Add-ons like ovens or interior windows can be selected in the quote builder.",
  },
  {
    idSlug: "domestic-day-rate",
    question: "How much is a domestic worker per day in Cape Town?",
    answer:
      "Day rates for domestic cleaning Cape Town-wide vary widely with hours, duties, and whether work is booked as a fixed-scope clean through a platform. Many households benchmark roughly R250–R450+ for a standard maintenance day equivalent, but your meaningful number is the fixed quote from bedrooms, bathrooms, and checklist—use instant quote so you compare apples to apples before anyone arrives.",
  },
  {
    idSlug: "part-time",
    question: "Can I book a part-time maid in Cape Town?",
    answer:
      "Yes. Part-time usually means fewer hours per visit or a lighter priority list rather than a full-home reset each time—pick your rooms and rhythm in booking. Weekly and bi-weekly remain the most common; part-time fits when you want ongoing domestic help without a daily presence.",
  },
  {
    idSlug: "near-me",
    question: MAID_SERVICES_NEAR_ME_FAQ_QUESTION,
    answer: `Yes. Shalean provides maid services across Sea Point, Claremont, Constantia, the CBD, and surrounding suburbs with one online quoting flow—same-day and next-day slots when routing allows. Browse every area hub on ${SITE_ORIGIN}/locations for coverage and local context.`,
  },
] as const;

function buildMaidServiceJsonLdNode(serviceId: string): Record<string, unknown> {
  const pageUrl = absoluteCanonicalUrl(CANONICAL_PATH);
  return {
    "@type": "Service",
    "@id": serviceId,
    name: "Maid Services in Cape Town (Recurring Domestic Cleaning)",
    serviceType: "House cleaning service",
    url: pageUrl,
    areaServed: primaryLocalBusinessMoneyPageAreaServed(),
    serviceArea: capeTownAdministrativeServiceArea(),
    provider: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: pageUrl,
      servicePhone: CUSTOMER_SUPPORT_TELEPHONE_E164,
      serviceLocation: {
        "@type": "Place",
        name: "Customer residence — Cape Town metro",
        containedInPlace: {
          "@type": "City",
          name: "Cape Town",
          containedInPlace: { "@type": "Country", name: "South Africa" },
        },
      },
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: "280",
      description:
        "From R280 per visit for typical weekly maintenance cleaning scopes; final price depends on bedrooms, bathrooms, and add-ons selected online.",
      url: pageUrl,
    },
  };
}

function buildMaidFaqJsonLdNode(pageUrl: string): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    isPartOf: { "@id": `${pageUrl}#webpage` },
    about: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    mainEntity: MAID_SERVICES_CAPE_TOWN_FAQS.map((item) => ({
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

function buildMaidHubJsonLd(): Record<string, unknown> {
  const pageUrl = absoluteCanonicalUrl(CANONICAL_PATH);
  const serviceId = `${pageUrl}#service`;
  return jsonLdGraphDocument([
    buildWebSiteJsonLdNode(),
    buildWebPageJsonLdNode({
      canonicalUrl: pageUrl,
      name: "Maid Services in Cape Town (Recurring Domestic Cleaning)",
      description: MAID_SERVICES_META_DESCRIPTION,
      primaryEntityId: serviceId,
      speakableCssSelectors: ["main h1"],
    }),
    buildPrimaryLocalBusinessMoneyPageNode(),
    buildMaidServiceJsonLdNode(serviceId),
    buildMaidFaqJsonLdNode(pageUrl),
    buildBreadcrumbJsonLdNode(pageUrl, [
      { name: "Home", url: SITE_ORIGIN },
      { name: "Maid services in Cape Town", url: pageUrl },
    ]),
  ]);
}

const maidServiceScheduleAnchors = [
  { id: "weekly", label: "Weekly maid services" },
  { id: "biweekly", label: "Bi-weekly maid services" },
  { id: "daily", label: "Daily maid services" },
  { id: "parttime", label: "Part-time maid services" },
] as const;

const maidServiceTypes = [
  {
    anchorId: "weekly",
    title: "Weekly cleaning",
    body: "A dependable rhythm for busy homes—kitchens, bathrooms, floors, and surfaces stay under control before mess compounds.",
  },
  {
    anchorId: "biweekly",
    title: "Bi-weekly cleaning",
    body: "Great middle ground if you handle light tidying between visits but want professional domestic cleaning Cape Town-wide on a steady schedule.",
  },
  {
    anchorId: "daily",
    title: "Daily cleaning",
    body: "Ideal for larger households, shared homes, or anyone who wants near-constant upkeep—scoped by hours and priority rooms.",
  },
  {
    anchorId: "parttime",
    title: "Part-time maid services",
    body: "Focused sessions on the rooms and tasks you prioritise, without committing to a full-home marathon each time.",
  },
] as const;

const whoMaidServicesFor = [
  "Busy professionals and families",
  "Homes that need consistent weekly upkeep",
  "Short-term rentals between deep cleans",
  "Anyone who prefers ongoing maintenance over once-off cleaning",
] as const;

const bookingSteps = [
  "Choose your schedule",
  "Select your home size",
  "Pick your cleaning type",
  "Get instant quote",
  "Confirm booking",
] as const;

const maidServicesIncluded = [
  "Kitchen cleaning and surface wipe-down",
  "Bathroom cleaning and sanitising",
  "Vacuuming and mopping floors",
  "Dusting furniture and surfaces",
  "General tidying of living areas",
] as const;

const exampleMaidPrices = [
  "1-bedroom weekly cleaning: from R280",
  "2-bedroom bi-weekly cleaning: from R350",
  "3-bedroom weekly cleaning: from R450",
] as const;

type MaidServicesCapeTownPageProps = {
  /** Live suburbs from `getHomePageData()` — deduped against static hub links on render. */
  seoLocationLinks?: readonly { readonly href: string; readonly label: string }[];
};

export function MaidServicesCapeTownPage({ seoLocationLinks = [] }: MaidServicesCapeTownPageProps) {
  const hubJsonLd = buildMaidHubJsonLd();

  const staticHubHrefs = new Set([
    ...popularCapeTownAreaHubs.map((h) => h.href),
    ...maidSuburbAuthorityCluster.map((l) => l.href),
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
              Maid Services in Cape Town (Recurring Cleaning)
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              Weekly, bi-weekly, and monthly domestic cleaning for households that want a dependable rhythm—not a once-off reset.
            </p>
            <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">
              Book recurring visits with vetted cleaners across Cape Town; change frequency when your schedule shifts—no long-term
              contract.
            </p>
            <ul className="mx-auto mt-6 max-w-lg space-y-2.5 text-left text-sm leading-relaxed text-slate-700 sm:max-w-xl sm:text-base">
              <li className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  Rated {GOOGLE_BUSINESS_REVIEWS.rating}★ from {GOOGLE_BUSINESS_REVIEWS.count}+ Google reviews — trusted by households
                  across Cape Town
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
                <span>No long-term contracts — book on your terms</span>
              </li>
            </ul>
            <p className="mx-auto mt-6 max-w-2xl text-lg font-semibold leading-snug text-slate-900 sm:text-xl">
              Get a reliable maid service in Cape Town that fits your schedule — no contracts, no stress.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Looking for a reliable maid service near you in Cape Town? Shalean provides trusted home cleaning across Sea Point,
              Claremont, Constantia, the CBD, and surrounding areas — with same-day and next-day slots when routing allows.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <GrowthCtaLink
                href="/booking/details"
                source="maid_services_cta_instant_quote"
                className={marketingPrimaryCtaClassName}
              >
                Get Instant Quote
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking"
                source="maid_services_cta_book_cleaner"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Book a Cleaner
              </GrowthCtaLink>
            </div>
            <ul className="mx-auto mt-6 flex max-w-xl flex-col gap-1.5 text-center text-sm font-medium text-slate-700 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-4 sm:gap-y-1">
              <li>Instant online pricing</li>
              <li className="hidden sm:block" aria-hidden>
                ·
              </li>
              <li>No contracts</li>
              <li className="hidden sm:block" aria-hidden>
                ·
              </li>
              <li>Pay securely online</li>
            </ul>
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
              Prefer flexible once-off or ad-hoc maintenance cleans rather than a recurring maid rhythm? See{" "}
              <Link
                href={svc["standard-cleaning-cape-town"].path}
                className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
              >
                cleaning services in Cape Town
              </Link>{" "}
              — this hub focuses on weekly and monthly domestic schedules.
            </p>
          </div>
        </div>
      </section>

      {/* What are maid services */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="what-are-maid-services-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="what-are-maid-services-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            What are maid services in Cape Town?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            In practice, maid services mean <strong className="font-semibold text-slate-800">recurring cleaning</strong> on a schedule you
            choose—not a once-off deep scrub unless you deliberately book that tier. Visits focus on{" "}
            <strong className="font-semibold text-slate-800">maintenance cleaning</strong>: kitchens, bathrooms, floors, dusting, and
            tidy-up so your home stays manageable week to week.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            That makes professional maid services Cape Town residents book ideal for busy homes where time is tight but standards stay
            high. If you need a full reset first, pair an initial deep clean with ongoing standard visits—many families use that path for
            home maid service Cape Town-wide.
          </p>
        </div>
      </section>

      {/* Types */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16" aria-labelledby="maid-types-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="maid-types-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Maid services we offer in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Pick the cadence that matches your household—all booked online with the same transparent quoting you see on our service hub
            pages.
          </p>
          <nav aria-label="On this page" className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/90 p-5">
            <p className="text-sm font-semibold text-slate-900">Jump to schedule type</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {maidServiceScheduleAnchors.map((a) => (
                <li key={a.id}>
                  <Link href={`#${a.id}`} className="font-medium text-blue-700 underline-offset-2 hover:underline">
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="mt-10 space-y-10">
            {maidServiceTypes.map((item) => (
              <li key={item.anchorId} id={item.anchorId} className="scroll-mt-28">
                <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="who-maid-for-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="who-maid-for-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Who maid services are best for
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            {whoMaidServicesFor.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* What's included */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16" aria-labelledby="maid-included-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="maid-included-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            What&apos;s included in maid services
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Maintenance visits focus on keeping everyday spaces reset—aligned with standard cleaning scope unless you choose add-ons or
            a deeper tier.
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            {maidServicesIncluded.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-6 leading-relaxed text-slate-600">
            Our cleaners arrive with standard cleaning supplies. If you have preferred products, you can request their use during
            booking.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="maid-pricing-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="maid-pricing-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Maid service prices in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Indicative bands align with how Shalean quotes standard maintenance scopes—your exact total still depends on bedrooms,
            bathrooms, and add-ons.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">
            Weekly cleaning plans in Cape Town are typically more affordable per visit than once-off bookings on the same scope—homes
            stay reset so each visit stays shorter. Bi-weekly sits in the middle for rhythm and budget. Sporadic or once-off maintenance
            often needs more time on the same footprint, which shows up as a higher per-visit total.
          </p>
          <ul className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-sm">
            <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
              <span className="font-medium">Weekly cleaning</span>
              <span className="text-lg font-semibold text-blue-700">from R280–R450 per visit</span>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
              <span className="font-medium">Bi-weekly cleaning</span>
              <span className="text-lg font-semibold text-blue-700">similar range (from R280–R450 per visit)</span>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">Daily cleaning</span>
              <span className="text-lg font-semibold text-blue-700">custom pricing</span>
            </li>
          </ul>
          <p className="mt-6 leading-relaxed text-slate-600">
            For numbers tied to your address and rooms,{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="maid_services_pricing_exact_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              get your exact maid service price
            </GrowthCtaLink>
            .
          </p>
          <p className="mt-5 leading-relaxed text-slate-600">
            See full{" "}
            <Link href={SEO_HUB_CLEANING_PRICES_PATH} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              cleaning prices in Cape Town
            </Link>{" "}
            for a detailed breakdown by service type and home size.
          </p>
          <p className="mt-5 leading-relaxed text-slate-600">
            Find maid services in your area:{" "}
            <Link href="/locations" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              browse all Cape Town suburb hubs
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Example prices — long-tail */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16" aria-labelledby="maid-example-prices-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="maid-example-prices-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Example maid service prices in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Illustrative weekly and bi-weekly entry points for standard maintenance scopes—your live total updates with bathrooms and
            extras.
          </p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
            {exampleMaidPrices.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-6 leading-relaxed text-slate-600">
            Get an exact price based on your home and schedule:{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="maid_services_example_prices_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Get instant quote
            </GrowthCtaLink>
            .
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="maid-benefits-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="maid-benefits-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Why choose maid services in Cape Town?
          </h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            <li>Consistent home cleanliness</li>
            <li>Saves time</li>
            <li>Flexible scheduling</li>
            <li>Trusted cleaners</li>
            <li>No contracts required</li>
          </ul>
        </div>
      </section>

      {/* Areas */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Maid services across Cape Town</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            If you&apos;re searching for maid services near you in Cape Town, we provide reliable cleaners across major suburbs—from the
            Atlantic Seaboard to the Southern Suburbs—with the same online quoting flow everywhere.
          </p>
          <p className="mt-4 leading-relaxed text-slate-600">Explore cleaning services in:</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
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
          <p className="mt-6 leading-relaxed text-slate-600">
            We provide maid services across Sea Point, Claremont, Constantia, Cape Town CBD, and surrounding suburbs—with flexible weekly
            schedules in each area.
          </p>
          <h3 className="mt-10 text-lg font-semibold tracking-tight text-slate-900">Cleaning services in Cape Town suburbs:</h3>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700 marker:text-blue-600">
            {maidSuburbAuthorityCluster.map((link) => (
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
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16" aria-labelledby="how-it-works-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="how-it-works-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            How to book a maid service in Cape Town
          </h2>
          <ol className="mt-8 list-decimal space-y-4 pl-5 text-slate-700 marker:font-semibold marker:text-blue-600">
            {bookingSteps.map((step) => (
              <li key={step} className="pl-1 leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-8 leading-relaxed text-slate-600">
            Ready when you are:{" "}
            <GrowthCtaLink
              href="/booking/details"
              source="maid_services_how_it_works_quote"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Get instant quote
            </GrowthCtaLink>
            .
          </p>
        </div>
      </section>

      {/* Related services */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-16" aria-labelledby="related-services-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="related-services-heading" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Other cleaning services in Cape Town
          </h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Maid visits usually map to standard cleaning on a recurring basis; these hubs explain scope when you need something
            different:
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-slate-700 marker:text-blue-600">
            <li>
              <Link href={svc["standard-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Standard cleaning services in Cape Town
              </Link>
            </li>
            <li>
              <Link href={svc["deep-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Deep cleaning services in Cape Town
              </Link>
            </li>
            <li>
              <Link href={svc["move-out-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Move-out cleaning services in Cape Town
              </Link>
            </li>
            <li>
              <Link href={svc["airbnb-cleaning-cape-town"].path} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Airbnb cleaning services in Cape Town
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Maid services FAQ</h2>
          <p className="mt-3 text-slate-600">Straight answers about recurring home cleaning in Cape Town.</p>

          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {MAID_SERVICES_CAPE_TOWN_FAQS.map((faq) => (
              <details key={faq.question} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left font-semibold text-slate-900">
                  {faq.question}
                  <span className="text-slate-400 transition group-open:rotate-180" aria-hidden>
                    ▼
                  </span>
                </summary>
                {faq.question === MAID_SERVICES_NEAR_ME_FAQ_QUESTION ? (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    Yes—Shalean covers Sea Point, Claremont, Constantia, the CBD, and surrounds with one quoting flow, including same-day
                    and next-day slots when routing allows. Browse every area hub on our{" "}
                    <Link href="/locations" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                      locations index
                    </Link>{" "}
                    for coverage and local detail.
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
                )}
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-b border-slate-100 bg-white py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 px-6 py-12 text-center shadow-lg sm:px-10 md:py-14">
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Book a trusted maid service in Cape Town today.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-blue-50">
              Lock a fixed total from your rooms and schedule—then book when it fits.
            </p>

            <ul className="mx-auto mt-8 flex max-w-lg flex-col gap-3 text-left text-sm text-blue-50 sm:max-w-xl">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>Transparent pricing</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>Trusted cleaners</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" aria-hidden />
                <span>Flexible scheduling</span>
              </li>
            </ul>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <GrowthCtaLink
                href="/booking/details"
                source="maid_services_final_cta_quote"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                Get your instant quote
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking"
                source="maid_services_final_cta_book"
                className="inline-flex items-center justify-center rounded-full border-2 border-white/80 bg-transparent px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Book a cleaner
              </GrowthCtaLink>
            </div>
          </div>
        </div>
      </section>

      {/* Hub navigation — above site footer */}
      <section className="border-b border-slate-100 bg-slate-50/80 py-14 md:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SeoInternalLinksBlock title="Hub navigation" className="rounded-2xl border border-slate-200 bg-slate-50/90 p-6" />
        </div>
      </section>
    </>
  );
}
