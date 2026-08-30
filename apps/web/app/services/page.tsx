import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppWindow, ArrowRight } from "lucide-react";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { MarketingHomeCoreServicesSection } from "@/components/marketing-home/sections/MarketingHomeCoreServicesSection";
import { MarketingHomeHowItWorksSection } from "@/components/marketing-home/sections/MarketingHomeHowItWorksSection";
import { MarketingHomeTrustSection } from "@/components/marketing-home/sections/MarketingHomeTrustSection";
import { MarketingAreasSection } from "@/components/marketing-home/sections/MarketingAreasSection";
import { MarketingHomeFinalCta } from "@/components/marketing-home/sections/MarketingHomeFinalCta";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import {
  ServicesHubFaqs,
  ServicesHubServiceDetails,
} from "@/components/services/ServicesHubAccordions";
import { CTAButton } from "@/components/ui/CTAButton";
import { ServicesStickyMobileCta } from "@/components/services/ServicesStickyMobileCta";
import { buildMarketingHomeServiceCards } from "@/lib/marketing/marketingHomeServicePresentation";
import { SERVICES_HUB_FAQS } from "@/lib/services/servicesHubFaqs";
import {
  CAPE_TOWN_SERVICE_SEO,
  type CapeTownSeoServiceSlug,
} from "@/lib/seo/capeTownSeoPages";
import {
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
  CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
} from "@/lib/seo/internalLinks";
import { buildPrimaryLocalBusinessMoneyPageNode } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { generateCtrTitle } from "@/lib/seo/metaTitle";
import { leadPriceForServiceSlug } from "@/lib/seo/serviceTitleLeadPrice";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { SITE_ORIGIN as SITE } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import { marketingStickyCtaMainPadding } from "@/lib/marketing/marketingMobileLayout";

const CANONICAL = "/services";
const PAGE_URL = `${SITE}${CANONICAL}`;
const p = CAPE_TOWN_SERVICE_SEO;
const primaryServiceCards = buildMarketingHomeServiceCards([]);

const HUB_SERVICE_SLUGS: CapeTownSeoServiceSlug[] = [
  "standard-cleaning-cape-town",
  "deep-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "office-cleaning-cape-town",
  "carpet-cleaning-cape-town",
];

const title = generateCtrTitle({
  base: "Cleaning Services",
  place: "Cape Town",
  fromPrice: leadPriceForServiceSlug("standard-cleaning-cape-town"),
  templateKey: "services-hub",
  brandSuffix: "Shalean",
  pageIntent: "hub",
});
const description = clampMetaDescription(
  "Book trusted cleaners in Cape Town for homes, apartments, and offices. Transparent pricing, flexible scheduling, and instant online booking with Shalean.",
);
const servicesItemListDescription = clampMetaDescription(
  "Main Shalean cleaning service guides for Cape Town customers.",
);

const hubPageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${PAGE_URL}#webpage`,
      url: PAGE_URL,
      name: "Professional Cleaning Services in Cape Town",
      description,
      isPartOf: { "@type": "WebSite", name: "Shalean Cleaning Services", url: SITE },
      breadcrumb: { "@id": `${PAGE_URL}#breadcrumbs` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Cleaning services", item: PAGE_URL },
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${PAGE_URL}#services-itemlist`,
      name: "Cleaning services offered in Cape Town",
      description: servicesItemListDescription,
      numberOfItems: HUB_SERVICE_SLUGS.length,
      itemListElement: HUB_SERVICE_SLUGS.map((slug, i) => {
        const block = p[slug];
        return {
          "@type": "ListItem",
          position: i + 1,
          name: block.h1,
          item: `${SITE}${block.path}`,
        };
      }),
    },
    {
      "@type": "FAQPage",
      "@id": `${PAGE_URL}#faq`,
      mainEntity: SERVICES_HUB_FAQS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    buildPrimaryLocalBusinessMoneyPageNode(),
  ],
};

export const metadata: Metadata = {
  title,
  description,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: PAGE_URL, languages: { "en-ZA": PAGE_URL } },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    locale: "en_ZA",
    siteName: "Shalean Cleaning Services",
    title,
    description,
    images: [
      {
        url: HOME_OG_IMAGE,
        width: HOME_OG_IMAGE_WIDTH,
        height: HOME_OG_IMAGE_HEIGHT,
        alt: HOME_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [HOME_OG_IMAGE],
  },
};

const PRICING_FACTORS = [
  {
    label: "Service",
    value: "Your service sets the starting point",
    hint: "Each cleaning type has its own scope and base price.",
  },
  {
    label: "Property",
    value: "Property size refines the price",
    hint: "Bedrooms, bathrooms and other property details adjust the cleaning total where applicable.",
  },
  {
    label: "Final total",
    value: "See the calculated amount before booking",
    hint: "The booking flow combines the service price, property details and any add-ons you selected above.",
  },
] as const;

export default function ServicesHubPage() {
  const jsonLdStr = JSON.stringify(hubPageJsonLd).replace(/</g, "\\u003c");
  const serviceDetails = [
    {
      id: "standard",
      title: "Standard cleaning checklist",
      bullets: p["standard-cleaning-cape-town"].included,
    },
    {
      id: "deep",
      title: "Deep cleaning checklist",
      bullets: p["deep-cleaning-cape-town"].included,
    },
    {
      id: "moveout",
      title: "Move in / out checklist",
      bullets: p["move-out-cleaning-cape-town"].included,
    },
    {
      id: "airbnb",
      title: "Airbnb turnover checklist",
      bullets: p["airbnb-cleaning-cape-town"].included,
    },
    {
      id: "office",
      title: "Office cleaning checklist",
      bullets: p["office-cleaning-cape-town"].included,
    },
    {
      id: "carpet",
      title: "Carpet cleaning checklist",
      bullets: p["carpet-cleaning-cape-town"].included,
    },
  ] as const;

  return (
    <MarketingLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

      <main className={`bg-background text-foreground ${marketingStickyCtaMainPadding}`}>
        <GrowthTracking
          event={ANALYTICS_EVENTS.PAGE_VIEW}
          payload={{
            page_type: "services_hub",
            page_slug: "services",
            suburb: "Cape Town",
            region: "Western Cape",
            content_group: "services_hub",
          }}
        />

        <HomeSection
          containerSize="marketing"
          className="overflow-hidden bg-background pt-[var(--ui-space-6)] pb-[var(--ui-space-10)] md:pt-[var(--ui-space-8)] md:pb-[var(--ui-space-12)] lg:pt-[var(--ui-space-10)] lg:pb-[var(--ui-space-16)]"
        >
          <div className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-[#F7FAFF] shadow-[var(--ui-shadow-lg)]">
            <div className="grid lg:min-h-[460px] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
              <div className="flex flex-col justify-center p-[var(--ui-space-6)] sm:p-[var(--ui-space-8)] lg:p-[var(--ui-space-10)] xl:p-[var(--ui-space-12)]">
                <div className="max-w-2xl">
                  <p className="inline-flex items-center rounded-[var(--ui-radius-pill)] border border-[#DBEAFE] bg-white px-[var(--ui-space-4)] py-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary shadow-[var(--ui-shadow-sm)]">
                    Cape Town cleaning services
                  </p>

                  <h1 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-hero-title)] font-semibold leading-[var(--ui-leading-hero)] tracking-[var(--ui-tracking-hero-title)] text-foreground">
                    <span className="block">Professional</span>
                    <span className="block text-primary">Cleaning Services</span>
                    <span className="mt-[var(--ui-space-2)] block">in Cape Town</span>
                  </h1>

                  <div className="mt-[var(--ui-space-6)] flex w-full flex-col gap-[var(--ui-space-3)] sm:w-auto sm:flex-row">
                    <CTAButton
                      href="/book"
                      variant="primary"
                      trackSource="services_hub_hero_prices"
                      seoHubCta={{ cta_location: "hero", cta_label: "See instant price", cta_kind: "get_price" }}
                      className="min-h-14 px-[var(--ui-space-8)]"
                    >
                      See instant price
                    </CTAButton>
                    <GetFreeQuoteLink source="services_hub_hero" variant="outline" className="min-h-14 bg-white px-[var(--ui-space-8)]">
                      Request a quote
                    </GetFreeQuoteLink>
                  </div>
                </div>
              </div>

              <div className="relative min-h-[260px] bg-muted sm:min-h-[340px] lg:min-h-full">
                <Image
                  src="/images/marketing/standard-cleaning-cape-town-kitchen.webp"
                  alt="Professional home cleaning in a bright Cape Town kitchen and living space"
                  fill
                  priority
                  fetchPriority="high"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover object-center"
                />
              </div>
            </div>
          </div>
        </HomeSection>

        <MarketingHomeCoreServicesSection
          cards={primaryServiceCards}
          layout="individual"
          afterCards={
            <aside className="flex flex-col gap-[var(--ui-space-5)] rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-[#EFF6FF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] sm:flex-row sm:items-center sm:justify-between md:p-[var(--ui-space-8)]">
              <div className="flex items-start gap-[var(--ui-space-4)]">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-[var(--ui-shadow-sm)]" aria-hidden>
                  <AppWindow className="h-6 w-6" strokeWidth={1.7} />
                </span>
                <div>
                  <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">Specialist guide</p>
                  <h3 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
                    Window Cleaning
                  </h3>
                  <p className="mt-[var(--ui-space-2)] max-w-2xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                    Need dedicated window cleaning? See what&apos;s covered for glass, frames and tracks. For interior glass as part of another clean, choose the Interior windows add-on where available.
                  </p>
                </div>
              </div>
              <Link
                href={p["window-cleaning-cape-town"].path}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View guide
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </aside>
          }
        />

        <MarketingHomeHowItWorksSection />
        <MarketingHomeTrustSection />

        <HomeSection
          id="included"
          containerSize="marketing"
          className="scroll-mt-24 bg-background md:py-[var(--ui-space-24)]"
          aria-labelledby="services-included-heading"
        >
          <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-[var(--ui-space-20)]">
            <div className="lg:sticky lg:top-28">
              <MarketingSectionHeader
                headingId="services-included-heading"
                align="left"
                eyebrow="Service scope"
                eyebrowTone="brand"
                title="Compare the scope before you book"
                description="The service cards above help you choose. Open a checklist here to compare what each of the six primary services includes before booking."
              />
              <Link
                href="#service-options"
                className="mt-[var(--ui-space-8)] inline-flex items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-body)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to service cards
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ServicesHubServiceDetails serviceDetails={[...serviceDetails]} />
          </div>
        </HomeSection>

        <HomeSection
          containerSize="marketing"
          className="!bg-[#F4F6FA] md:py-[var(--ui-space-24)]"
          aria-labelledby="pricing-heading"
        >
          <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-[var(--ui-space-20)]">
            <div className="lg:sticky lg:top-28">
              <MarketingSectionHeader
                headingId="pricing-heading"
                align="left"
                eyebrow="Pricing"
                eyebrowTone="brand"
                title="Understand how your cleaning price is built"
                description="Your service and property details determine the base cleaning amount. The booking flow then shows the current final total before you continue."
              />
              <div className="mt-[var(--ui-space-8)] flex flex-wrap gap-[var(--ui-space-3)]">
                <CTAButton
                  href="/book"
                  variant="primary"
                  trackSource="services_hub_pricing_cta"
                  seoHubCta={{ cta_location: "pricing", cta_label: "Get exact price", cta_kind: "get_price" }}
                  seoPricingInteraction={{ interaction: "get_exact_price_click", label: "Get exact price" }}
                  className="px-[var(--ui-space-8)]"
                >
                  Get exact price
                </CTAButton>
                <Link
                  href={CAPE_TOWN_PRICING_AUTHORITY_HREF}
                  className="inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View cleaning prices
                </Link>
              </div>
              <p className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Need broader market context? Read the{" "}
                <Link
                  href={CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF}
                  className="font-medium text-foreground underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                >
                  Cape Town cleaning cost guide
                </Link>
                .
              </p>
            </div>

            <div className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-[#EFF6FF] shadow-[var(--ui-shadow-sm)]">
              {PRICING_FACTORS.map((factor, index) => (
                <article
                  key={factor.label}
                  className="grid min-h-[168px] gap-[var(--ui-space-5)] border-b border-[#DBEAFE] p-[var(--ui-space-6)] last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-center md:p-[var(--ui-space-8)]"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[length:var(--ui-text-small)] font-semibold text-foreground shadow-[var(--ui-shadow-sm)]">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">{factor.label}</p>
                    <h3 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
                      {factor.value}
                    </h3>
                    <p className="mt-[var(--ui-space-3)] max-w-2xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
                      {factor.hint}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </HomeSection>

        <MarketingAreasSection />

        <HomeSection
          id="faq"
          containerSize="marketing"
          className="scroll-mt-24 bg-background md:py-[var(--ui-space-24)]"
          aria-labelledby="services-faq-heading"
        >
          <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-[var(--ui-space-20)]">
            <div className="lg:sticky lg:top-28">
              <MarketingSectionHeader
                headingId="services-faq-heading"
                align="left"
                eyebrow="FAQ"
                eyebrowTone="brand"
                title="Questions before you book?"
                description="Quick answers about choosing a service, understanding pricing and completing your booking in Cape Town."
              />
              <Link
                href="/faq"
                className="mt-[var(--ui-space-8)] inline-flex items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-body)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View all FAQs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ServicesHubFaqs
              faqs={SERVICES_HUB_FAQS}
              faqAnalytics={{ page_slug: "services", suburb: "Cape Town" }}
            />
          </div>
        </HomeSection>

        <MarketingHomeFinalCta
          eyebrow="Choose your service"
          title="Ready to see your cleaning price?"
          description="Start with the service that fits your space, review the scope and see your total before checkout."
          ctaLabel="See instant price"
          ctaSource="services_hub_final_cta"
        />
      </main>

      <ServicesStickyMobileCta />
    </MarketingLayout>
  );
}
