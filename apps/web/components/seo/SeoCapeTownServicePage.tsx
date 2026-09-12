import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { getAreaProgrammaticBlogLinksForCapeTownService } from "@/lib/blog/programmaticPosts";
import { marketingStickyCtaMainPadding } from "@/lib/marketing/marketingMobileLayout";
import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import {
  WindowCleaningPricingTrustSection,
  WindowCleaningServiceTypesSection,
} from "@/components/seo/WindowCapeTownServiceExtendedContent";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { ServicePageCommercialIntentSection } from "@/components/seo/ServicePageCommercialIntentSection";
import type { PrimaryCapeTownServiceExtensionSlots } from "@/components/services/PrimaryCapeTownServiceExtensions";
import { SeoBreadcrumbs } from "@/components/seo/SeoBreadcrumbs";
import { CapeTownServiceHero } from "@/components/services/CapeTownServiceHero";
import { CAPE_TOWN_SERVICE_SEO, resolveCapeTownServiceSchemaFields } from "@/lib/seo/capeTownSeoPages";
import {
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
  getSecondaryEditorialBlogLink,
  getServicePagePricingEducationBlogLink,
  partitionServiceHubLocationLinks,
  servicePageExtraLocationSentenceLinks,
} from "@/lib/seo/internalLinks";
import {
  dedupeFaqsByQuestion,
  STANDARD_CLEANING_SNIPPET_FAQS,
} from "@/lib/seo/standardCleaningMoneyPageFaqs";
import { capeTownAdministrativeServiceArea } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";

type Props = {
  slug: CapeTownSeoServiceSlug;
  trustStats: PublicReviewBannerStats | null;
  initialLocationSlug?: string | null;
  heroVariant?: "legacy" | "primary";
  extensionSlots?: PrimaryCapeTownServiceExtensionSlots;
};

export function SeoCapeTownServicePage({ slug, trustStats, heroVariant = "legacy", extensionSlots }: Props) {
  const data = CAPE_TOWN_SERVICE_SEO[slug];
  const bookingPath = "/book";
  const introHeading = data.introSectionHeading ?? "How this service works in Cape Town";
  const includedHeading = data.includedSectionHeading ?? "What's included";
  const areasHeading = data.areasSectionHeading ?? "Areas we serve in Cape Town";
  const areasIntro =
    data.areasSectionIntro ??
    "We serve suburbs across Cape Town—add your address at checkout to confirm availability and routing.";
  const { featured: featuredHubLinks, other: otherHubLinks } = partitionServiceHubLocationLinks(slug);
  const secondaryHubLinks = otherHubLinks.slice(0, 8);
  const areasPillLinks = [...featuredHubLinks, ...secondaryHubLinks];
  const areasShownHrefs = new Set(areasPillLinks.map((l) => l.href));
  const areasSentenceLinks = servicePageExtraLocationSentenceLinks(areasShownHrefs);
  const areaProgrammaticBlogLinks = getAreaProgrammaticBlogLinksForCapeTownService(slug);
  const additionalAreaGuideLinks = (areaProgrammaticBlogLinks ?? []).filter(
    (item) => !areasShownHrefs.has(item.href),
  );
  const pricingEducationBlog = getServicePagePricingEducationBlogLink(slug);
  const secondaryEditorialBlog = getSecondaryEditorialBlogLink(slug);

  const heroTrustStrip = extensionSlots?.heroTrustStrip;

  const heroCopy = (
    <>
      <p data-service-hero-eyebrow className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">{data.h1}</h1>
      {heroTrustStrip}
      <p className="mt-4 text-lg leading-relaxed text-zinc-600">{data.description}</p>
      {slug === "standard-cleaning-cape-town" ? (
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Looking for <strong className="font-semibold text-zinc-800">cleaning services near you in Cape Town</strong>? Book
          online with upfront pricing and visible availability.
        </p>
      ) : null}
      <div data-service-hero-actions className="mt-8 flex flex-wrap gap-3">
        <GrowthCtaLink
          href={bookingPath}
          source={`seo_ct_${slug}_hero`}
          className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          {extensionSlots?.heroPrimaryLabel ?? `Book ${data.bookingLabel}`}
        </GrowthCtaLink>
        <SafeInternalLink
          href="#included"
          className="inline-flex min-h-12 items-center rounded-xl border border-blue-200 bg-white px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
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

  // Emit AggregateRating only when live trustStats are present — hardcoded GBP constants are unverified.
  if (slug === "standard-cleaning-cape-town" && trustStats && trustStats.reviewCount > 0) {
    localBusinessNode.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(Math.round(trustStats.avgRating * 10) / 10),
      reviewCount: String(trustStats.reviewCount),
    };
  }

  const mergedStandardFaqs =
    slug === "standard-cleaning-cape-town"
      ? dedupeFaqsByQuestion(data.faqs, STANDARD_CLEANING_SNIPPET_FAQS).slice(0, 6)
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

  /** aggregateRating on money page uses verified GBP aggregate or live review RPC stats when present. */
  const jsonLdGraph: Record<string, unknown>[] = [
    localBusinessNode,
    {
      "@type": ["Service", "CleaningService"],
      "@id": serviceNodeId,
      name: schemaName,
      serviceType: schemaServiceType,
      url: pageUrl,
      areaServed: { "@type": "Place", name: "Cape Town, South Africa" },
      serviceArea: capeTownAdministrativeServiceArea(),
      provider: { "@id": localBusinessId },
    },
    breadcrumbEntity,
    faqPageEntity,
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": jsonLdGraph,
  };

  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <main className={`bg-white text-zinc-900 ${marketingStickyCtaMainPadding}`}>
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
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-blue-900/90">
          Cape Town cleaning with clear scope, transparent quotes, and online booking.
        </p>
      </div>

      <CapeTownServiceHero copy={heroCopy} image={data.heroImage} variant={heroVariant} />
      {extensionSlots?.afterHero}

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{introHeading}</h2>
          <div className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            {extensionSlots?.overviewLead}
            {data.explanation.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p>
              <SafeInternalLink
                href={CAPE_TOWN_PRICING_AUTHORITY_HREF}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                See current tier from-prices
              </SafeInternalLink>{" "}
              and lock your fixed total before checkout. For indicative bands and comparison methodology—not a substitute for
              checkout—read{" "}
              <SafeInternalLink
                href={pricingEducationBlog.href}
                className="font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                {pricingEducationBlog.anchor}
              </SafeInternalLink>
              .
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
                Cleaning along the Atlantic Seaboard? Sea Point and Green Point often need extra dwell on salt-air buildup,
                compact apartments, and rental-heavy streets—lock bedrooms, bathrooms, and add-ons for your deep clean online.
              </p>
            ) : null}
            {extensionSlots?.overviewTail}
            {data.neighbourhoodBlogGuide && !isSeoRebuildGonePath(data.neighbourhoodBlogGuide.blogPath) ? (
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
            {data.extraNeighbourhoodBlogGuides
              ?.filter((g) => !isSeoRebuildGonePath(g.blogPath))
              .map((g) => (
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

      <section id="included" className="scroll-mt-28 border-b border-blue-100 bg-blue-50/40 py-16">
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
          {data.exclusions && data.exclusions.length > 0 ? (
            <div className="mt-10">
              <h3 className="text-xl font-bold tracking-tight text-zinc-900">What&apos;s not included</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Clear exclusions help you choose the right service and avoid mismatched expectations at arrival.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.exclusions.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-700 shadow-sm"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs font-bold text-zinc-500" aria-hidden>
                      –
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {extensionSlots?.afterIncluded}

      <section className="border-b border-blue-100 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            {extensionSlots?.benefitsHeading ?? "Benefits for Cape Town customers"}
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

      {extensionSlots?.afterBenefits}

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

      {extensionSlots?.beforeAreas}

      <section className="border-b border-blue-100 bg-blue-50/30 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            <MapPin className="h-6 w-6 text-blue-600" aria-hidden />
            {areasHeading}
          </h2>
          <p className="mt-3 text-zinc-600">{areasIntro}</p>
          {extensionSlots?.areasLead}
          {slug !== "standard-cleaning-cape-town" &&
          slug !== "window-cleaning-cape-town" &&
          slug !== "airbnb-cleaning-cape-town" ? (
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              Looking for {data.bookingLabel} with suburb-specific context?{" "}
              <SafeInternalLink href={bookingPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Book online
              </SafeInternalLink>{" "}
              and add parking, access, and layout notes at checkout.
            </p>
          ) : null}
          {areasPillLinks.length > 0 ? (
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
          ) : null}
          <p className="mt-6 text-sm leading-relaxed text-zinc-600">
            {areasSentenceLinks.length > 0 ? (
              <>
                Related guides:{" "}
                {areasSentenceLinks.map((l, i, arr) => (
                  <span key={l.href}>
                    {i > 0 ? (i === arr.length - 1 ? ", or " : ", ") : null}
                    <SafeInternalLink href={l.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                      {l.label}
                    </SafeInternalLink>
                  </span>
                ))}
                .{" "}
              </>
            ) : null}
            <SafeInternalLink href="/book" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Book online
            </SafeInternalLink>{" "}
            and add parking, building access, and suburb details at checkout.
          </p>
          {additionalAreaGuideLinks.length > 0 ? (
            <div className="mt-8 border-t border-blue-100 pt-6">
              <h3 className="text-base font-semibold text-zinc-900">More local cleaning guides</h3>
              <ul className="mt-4 flex flex-wrap gap-3">
                {additionalAreaGuideLinks.map((item) => (
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
          ) : null}
        </div>
      </section>

      <section id="faqs" className="scroll-mt-24 border-b border-blue-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            {extensionSlots?.faqHeading ?? "Frequently asked questions"}
          </h2>
          <p className="mt-3 text-zinc-600">
            {extensionSlots?.faqDescription ?? "Straight answers about booking, scope, and what to expect for this service in Cape Town."}
          </p>
          <div className="mt-8 space-y-5">
            {faqSchemaSource.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-zinc-900">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-100 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <RelatedLinks placement="service" currentServiceSlug={slug} showBookingCta={false} />
        </div>
      </section>

      <section className="bg-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">
          {extensionSlots?.finalCta.title ?? `Ready to book ${data.bookingLabel}?`}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">
          {extensionSlots?.finalCta.description ?? "Get an instant price for your Cape Town address, bedrooms, and bathrooms—then choose a time that works."}
        </p>
        <div className="mx-auto mt-6 flex flex-wrap justify-center gap-3">
          <GrowthCtaLink
            href={bookingPath}
            source={`seo_ct_${slug}_footer`}
            className="inline-flex min-h-12 items-center rounded-xl bg-white px-6 text-base font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            {extensionSlots?.finalCta.primaryLabel ?? (slug === "window-cleaning-cape-town" ? "Book window cleaning" : "Start booking")}
          </GrowthCtaLink>
          {slug === "window-cleaning-cape-town" ? (
            <GrowthCtaLink
              href={bookingPath}
              source={`seo_ct_${slug}_footer_avail`}
              className="inline-flex min-h-12 items-center rounded-xl border border-white/40 bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-500"
            >
              Check availability
            </GrowthCtaLink>
          ) : null}
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-blue-200 bg-white/95 backdrop-blur-sm md:hidden print:hidden">
        <div className="mx-auto flex max-w-lg gap-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <GrowthCtaLink
            href={bookingPath}
            source={`seo_ct_${slug}_sticky_book`}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
          >
            Book now
          </GrowthCtaLink>
        </div>
      </div>
    </main>
  );
}
