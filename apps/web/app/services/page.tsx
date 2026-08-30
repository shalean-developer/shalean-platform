import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { MarketingHomeFinalCta } from "@/components/marketing-home/sections/MarketingHomeFinalCta";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { ServiceCard } from "@/components/services/ServiceCard";
import { ServicesAreasSection } from "@/components/services/ServicesAreasSection";
import { ServicesHubAccordions } from "@/components/services/ServicesHubAccordions";
import { CTAButton } from "@/components/ui/CTAButton";
import { ServicesStickyMobileCta } from "@/components/services/ServicesStickyMobileCta";
import { SERVICES_HUB_FAQS } from "@/lib/services/servicesHubFaqs";
import { getServicesHubAreasByRegion } from "@/lib/services/servicesHubAreas";
import {
  CAPE_TOWN_SERVICE_SEO,
  type CapeTownSeoServiceSlug,
} from "@/lib/seo/capeTownSeoPages";
import {
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
  CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
} from "@/lib/seo/internalLinks";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
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
import {
  AppWindow,
  Building2,
  CalendarCheck,
  Check,
  ClipboardList,
  DoorOpen,
  Droplets,
  Home,
  Layers,
  ListChecks,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

const CANONICAL = "/services";
const PAGE_URL = `${SITE}${CANONICAL}`;

const p = CAPE_TOWN_SERVICE_SEO;

const HUB_SERVICE_SLUGS: CapeTownSeoServiceSlug[] = [
  "standard-cleaning-cape-town",
  "deep-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "office-cleaning-cape-town",
  "carpet-cleaning-cape-town",
  "window-cleaning-cape-town",
];

const title = generateCtrTitle({
  base: "Home Cleaning Services",
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

const HOW_STEPS = [
  {
    step: "01",
    title: "Tell us about your space",
    body: "Add your address, rooms, bathrooms and access notes so the service scope starts with the right details.",
    Icon: ClipboardList,
    surface: "#C9D8FF",
  },
  {
    step: "02",
    title: "Choose the right clean",
    body: "Compare standard, deep, move, Airbnb, office and specialist cleaning before you continue.",
    Icon: ListChecks,
    surface: "#B8C5FF",
  },
  {
    step: "03",
    title: "See your total and book",
    body: "Review the price, choose an available slot and adjust extras before completing your booking.",
    Icon: CalendarCheck,
    surface: "#EFF6FF",
  },
] as const;

const PRICING_FACTORS = [
  {
    label: "Service",
    value: "Start with the right scope",
    hint: "Standard, deep, move, Airbnb, office, carpet or window cleaning.",
  },
  {
    label: "Property",
    value: "Add accurate details",
    hint: "Bedrooms, bathrooms and property details help keep the visit and total realistic.",
  },
  {
    label: "Extras",
    value: "Choose only what you need",
    hint: "Review selected extras and every line item before you complete checkout.",
  },
] as const;

export default function ServicesHubPage() {
  const jsonLdStr = JSON.stringify(hubPageJsonLd).replace(/</g, "\\u003c");
  const areaGroups = getServicesHubAreasByRegion();

  const serviceDetails = [
    {
      id: "standard",
      title: "What’s included in standard cleaning",
      bullets: p["standard-cleaning-cape-town"].included,
    },
    {
      id: "deep",
      title: "What’s included in deep cleaning",
      bullets: p["deep-cleaning-cape-town"].included,
    },
    {
      id: "moveout",
      title: "Move-out checklist highlights",
      bullets: p["move-out-cleaning-cape-town"].included,
    },
    {
      id: "airbnb",
      title: "Airbnb turnover checklist highlights",
      bullets: p["airbnb-cleaning-cape-town"].included,
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
          className="overflow-hidden bg-background pt-[var(--ui-space-10)] pb-[var(--ui-space-16)] md:pt-[var(--ui-space-16)] md:pb-[var(--ui-space-20)] lg:py-[var(--ui-space-24)]"
        >
          <div className="grid items-center gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-[var(--ui-space-16)] xl:gap-[var(--ui-space-20)]">
            <div className="max-w-2xl">
              <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-primary">Services</p>
              <h1 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-hero-title)] font-semibold leading-[var(--ui-leading-hero)] tracking-[var(--ui-tracking-hero-title)] text-foreground">
                <span className="block text-primary">Professional Cleaning Services</span>
                <span className="mt-[var(--ui-space-2)] block">in Cape Town</span>
              </h1>
              <p className="mt-[var(--ui-space-6)] max-w-xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Choose a cleaning service for your home, move, short stay or workplace, then see the scope and price before you book.
              </p>

              <div className="mt-[var(--ui-space-8)] space-y-[var(--ui-space-3)]">
                {[
                  "Vetted and trained cleaners",
                  "See your price before checkout",
                  "Clear service scope before the visit",
                ].map((line) => (
                  <div key={line} className="flex items-center gap-[var(--ui-space-3)] text-[length:var(--ui-text-body)] text-foreground">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <div className="mt-[var(--ui-space-8)] flex w-full flex-col gap-[var(--ui-space-3)] sm:w-auto sm:flex-row">
                <CTAButton
                  href="/book"
                  variant="primary"
                  trackSource="services_hub_hero_prices"
                  seoHubCta={{ cta_location: "hero", cta_label: "See instant price", cta_kind: "get_price" }}
                  className="min-h-14 px-[var(--ui-space-8)]"
                >
                  See instant price
                </CTAButton>
                <GetFreeQuoteLink source="services_hub_hero" variant="outline" className="min-h-14 px-[var(--ui-space-8)]">
                  Request a quote
                </GetFreeQuoteLink>
              </div>

              <p className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Popular starting points:{" "}
                <Link href={p["standard-cleaning-cape-town"].path} className="font-medium text-foreground underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                  standard home cleaning
                </Link>
                {" · "}
                <Link href={p["airbnb-cleaning-cape-town"].path} className="font-medium text-foreground underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                  Airbnb turnover cleaning
                </Link>
                {" · "}
                <Link href={CAPE_TOWN_PRICING_AUTHORITY_HREF} className="font-medium text-foreground underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                  cleaning prices
                </Link>
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[520px] lg:mx-0 lg:justify-self-end">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-xl)] ring-1 ring-border/70">
                <Image
                  src="/images/marketing/standard-cleaning-cape-town-kitchen.webp"
                  alt="Professional home cleaning in a bright Cape Town kitchen and living space"
                  fill
                  priority
                  fetchPriority="high"
                  sizes="(max-width: 1024px) 100vw, 520px"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </HomeSection>

        <HomeSection
          id="service-options"
          containerSize="marketing"
          className="scroll-mt-24 !bg-[#F4F6FA] md:py-[var(--ui-space-20)]"
          aria-labelledby="services-types-heading"
        >
          <MarketingSectionHeader
            headingId="services-types-heading"
            eyebrow="Choose your clean"
            title="Cleaning for homes, stays and workplaces"
            description="Six primary cleaning services share one clear booking path. Window Cleaning remains a specialist guide when your scope needs it."
          />

          <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] sm:grid-cols-2 lg:grid-cols-3">
            <ServiceCard
              icon={<Sparkles className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Standard Cleaning"
              description="Weekly or once-off upkeep for kitchens, bathrooms, floors and everyday surfaces on a clear checklist."
              learnMoreHref={p["standard-cleaning-cape-town"].path}
              bookSource="services_hub_card_standard"
              seoHubTrack
            />
            <ServiceCard
              icon={<Droplets className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Deep Cleaning"
              description="A more detailed reset for built-up dirt, grease, grout and areas that need extra attention."
              learnMoreHref={p["deep-cleaning-cape-town"].path}
              bookSource="services_hub_card_deep"
              seoHubTrack
            />
            <ServiceCard
              icon={<DoorOpen className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Move In / Out Cleaning"
              description="Handover-focused cleaning for empty or nearly empty homes before moving day, inspection or occupation."
              learnMoreHref={p["move-out-cleaning-cape-town"].path}
              bookSource="services_hub_card_moveout"
              seoHubTrack
            />
            <ServiceCard
              icon={<Home className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Airbnb Cleaning"
              description="Guest-ready turnover cleaning between stays with presentation, hygiene and repeatable hosting scope in mind."
              learnMoreHref={p["airbnb-cleaning-cape-town"].path}
              bookHref="/book"
              bookSource="services_hub_card_airbnb"
              seoHubTrack
            />
            <ServiceCard
              icon={<Building2 className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Office Cleaning"
              description="Professional cleaning for desks, kitchens, bathrooms, floors and shared workplace areas."
              learnMoreHref={p["office-cleaning-cape-town"].path}
              bookSource="services_hub_card_office"
              seoHubTrack
            />
            <ServiceCard
              icon={<Layers className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Carpet Cleaning"
              description="Refresh carpets and high-traffic soft floor areas as a specialist visit or alongside a wider clean."
              learnMoreHref={p["carpet-cleaning-cape-town"].path}
              bookSource="services_hub_card_carpet"
              seoHubTrack
            />
            <ServiceCard
              icon={<AppWindow className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
              title="Window Cleaning"
              description="Interior and exterior glass, frames and tracks for homes and smaller workplaces where the scope allows."
              learnMoreHref={p["window-cleaning-cape-town"].path}
              bookSource="services_hub_card_window"
              seoHubTrack
            />
          </div>
        </HomeSection>

        <HomeSection containerSize="marketing" className="bg-background md:py-[var(--ui-space-20)]" aria-labelledby="how-heading">
          <MarketingSectionHeader
            headingId="how-heading"
            eyebrow="How it works"
            title="From the right service to a confirmed clean"
            description="The same simple booking path supports every primary service."
          />

          <ol className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
            {HOW_STEPS.map(({ step, title: stepTitle, body, Icon, surface }) => (
              <li
                key={step}
                className="min-h-[300px] rounded-[var(--ui-radius-marketing)] p-[var(--ui-space-8)] shadow-[var(--ui-shadow-sm)]"
                style={{ backgroundColor: surface }}
              >
                <div className="flex items-center justify-between gap-[var(--ui-space-4)]">
                  <span className="text-[length:var(--ui-text-small)] font-semibold tracking-[0.12em] text-foreground/55">{step}</span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-foreground">
                    <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                  </span>
                </div>
                <h3 className="mt-[var(--ui-space-10)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
                  {stepTitle}
                </h3>
                <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-foreground/70">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </HomeSection>

        <HomeSection containerSize="marketing" className="!bg-[#EFF6FF] md:py-[var(--ui-space-20)]" aria-labelledby="pricing-heading">
          <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-[var(--ui-space-16)]">
            <div>
              <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-primary">Pricing</p>
              <h2 id="pricing-heading" className="mt-[var(--ui-space-3)] max-w-xl text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-[-0.03em] text-foreground">
                Your price follows the scope you choose
              </h2>
              <p className="mt-[var(--ui-space-5)] max-w-xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
                Service type, property details and extras shape the total. Use the booking flow for the current exact amount rather than relying on a static estimate.
              </p>
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
            </div>

            <div className="grid gap-[var(--ui-space-4)]">
              {PRICING_FACTORS.map((factor, index) => (
                <article
                  key={factor.label}
                  className="grid gap-[var(--ui-space-4)] rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-background p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DDEBFF] text-[length:var(--ui-text-small)] font-semibold text-foreground">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">{factor.label}</p>
                    <h3 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">{factor.value}</h3>
                    <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">{factor.hint}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <p className="mt-[var(--ui-space-8)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Want broader market context before choosing? Read our{" "}
            <Link href={CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF} className="font-medium text-foreground underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
              Cape Town cleaning cost guide
            </Link>
            .
          </p>
        </HomeSection>

        <HomeSection containerSize="marketing" className="!bg-[#F4F6FA] md:py-[var(--ui-space-16)]" aria-label="Why customers choose Shalean">
          <div className="grid gap-[var(--ui-space-4)] sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[var(--ui-radius-marketing)] bg-background p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" aria-hidden />
              <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">
                {GOOGLE_BUSINESS_REVIEWS.rating} / 5 on Google
              </p>
              <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] text-muted-foreground">Customer proof you can check independently.</p>
            </article>
            <article className="rounded-[var(--ui-radius-marketing)] bg-[#DDEBFF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Vetted cleaners</p>
              <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] text-foreground/65">Cleaner readiness is checked before customer allocation.</p>
            </article>
            <article className="rounded-[var(--ui-radius-marketing)] bg-[#C9D8FF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
              <Check className="h-6 w-6 text-foreground" aria-hidden />
              <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Clear scope</p>
              <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] text-foreground/65">Know what service you selected before the visit starts.</p>
            </article>
            <article className="rounded-[var(--ui-radius-marketing)] bg-[#EFF6FF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
              <Lock className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Secure online booking</p>
              <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] text-muted-foreground">Review your booking details and total before checkout.</p>
            </article>
          </div>
        </HomeSection>

        <HomeSection
          id="included"
          containerSize="marketing"
          className="scroll-mt-24 bg-background md:py-[var(--ui-space-20)]"
          aria-label="Service inclusions and frequently asked questions"
        >
          <ServicesHubAccordions
            serviceDetails={[...serviceDetails]}
            faqs={SERVICES_HUB_FAQS}
            faqAnalytics={{ page_slug: "services", suburb: "Cape Town" }}
          />
        </HomeSection>

        <HomeSection containerSize="marketing" className="!bg-[#EFF6FF] md:py-[var(--ui-space-20)]" aria-labelledby="areas-heading">
          <MarketingSectionHeader
            headingId="areas-heading"
            eyebrow="Cape Town coverage"
            title="Find cleaning in your suburb"
            description="Browse local hubs for suburb context, then continue into the same Cape Town-wide booking flow."
          />
          <ServicesAreasSection groups={areaGroups} />
        </HomeSection>

        <HomeSection containerSize="marketing" className="!bg-[#F4F6FA] md:py-[var(--ui-space-16)]" aria-label="Related Shalean pages">
          <div className="grid gap-[var(--ui-space-8)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <SeoInternalLinksBlock
              title="Explore Shalean"
              className="rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]"
            />
            <div className="rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
              <RelatedLinks placement="services_hub" />
            </div>
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
