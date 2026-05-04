import type { Metadata } from "next";
import Image from "next/image";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { ServiceCard } from "@/components/services/ServiceCard";
import { ServicesAreasSection } from "@/components/services/ServicesAreasSection";
import { ServicesHubAccordions } from "@/components/services/ServicesHubAccordions";
import { CTAButton } from "@/components/ui/CTAButton";
import { Section } from "@/components/ui/Section";
import { ServicesStickyMobileCta } from "@/components/services/ServicesStickyMobileCta";
import { SERVICES_HUB_FAQS } from "@/lib/services/servicesHubFaqs";
import { getServicesHubAreasByRegion } from "@/lib/services/servicesHubAreas";
import {
  CAPE_TOWN_SERVICE_SEO,
  type CapeTownSeoServiceSlug,
} from "@/lib/seo/capeTownSeoPages";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import {
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

const SITE = "https://www.shalean.co.za";
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
];

const title = "Professional Cleaning Services Cape Town | Book Online | Shalean";
const description =
  "Book trusted cleaners in Cape Town for homes, apartments, and offices. Transparent pricing, flexible scheduling, and instant online booking with Shalean.";

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
      breadcrumb: { "@id": `${PAGE_URL}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE },
        { "@type": "ListItem", position: 2, name: "Cleaning services", item: PAGE_URL },
      ],
    },
    {
      "@type": "ItemList",
      "@id": `${PAGE_URL}#services-itemlist`,
      name: "Cleaning services offered in Cape Town",
      description: "Main Shalean cleaning service guides for Cape Town customers.",
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
  ],
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title,
    description,
    images: [{ url: "/images/marketing/standard-cleaning-cape-town-kitchen.webp", alt: "Professional cleaning in Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/marketing/standard-cleaning-cape-town-kitchen.webp"],
  },
};

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

      <main className="bg-white pb-28 text-zinc-900 md:pb-0">
        <GrowthTracking
          event="page_view"
          payload={{
            page_type: "services_hub",
            page_slug: "services",
            suburb: "Cape Town",
            region: "Western Cape",
            content_group: "services_hub",
          }}
        />
        {/* Hero */}
        <Section spacing="tight" className="pt-10 md:pt-14">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12 lg:gap-14">
            <div>
              <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-blue-950 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                Professional Cleaning Services in Cape Town
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                Book trusted cleaners for your home, apartment, or office — transparent pricing, flexible scheduling, and
                instant booking.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "From R300 — exact total before you pay",
                  "Same-day availability when routing allows",
                  "Background-checked cleaners",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm font-medium text-blue-950 sm:text-base">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <CTAButton
                  href="/booking/details"
                  variant="primary"
                  trackSource="services_hub_hero_book"
                  seoHubCta={{ cta_location: "hero", cta_label: "Book a Cleaner", cta_kind: "book_now" }}
                  className="min-h-12 rounded-xl px-8"
                >
                  Book a Cleaner
                </CTAButton>
                <CTAButton
                  href="/booking/details"
                  variant="secondary"
                  trackSource="services_hub_hero_prices"
                  seoHubCta={{ cta_location: "hero", cta_label: "See Prices", cta_kind: "get_price" }}
                  className="min-h-12 rounded-xl px-8"
                >
                  See Prices
                </CTAButton>
              </div>
            </div>
            <div className="relative hidden aspect-square overflow-hidden rounded-2xl bg-zinc-100 shadow-lg ring-1 ring-black/5 md:block">
              <Image
                src="/images/marketing/standard-cleaning-cape-town-kitchen.webp"
                alt="Professional home cleaning — bright kitchen and living space in Cape Town"
                fill
                priority
                sizes="(max-width: 768px) 0vw, 480px"
                className="object-cover"
              />
            </div>
          </div>
        </Section>

        {/* Services grid */}
        <section className="border-t border-zinc-100 bg-zinc-50/80" aria-labelledby="services-types-heading">
          <Section>
            <h2 id="services-types-heading" className="text-2xl font-bold tracking-tight text-blue-950 md:text-3xl">
              Our cleaning services
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 md:text-base">
              Six Cape Town guides — same booking flow, scoped to how your space is used.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <ServiceCard
                icon={<Sparkles className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Standard Cleaning"
                description="Weekly or once-off upkeep — kitchens, bathrooms, floors, and dusting on a predictable checklist."
                learnMoreHref={p["standard-cleaning-cape-town"].path}
                bookSource="services_hub_card_standard"
                seoHubTrack
              />
              <ServiceCard
                icon={<Droplets className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Deep Cleaning"
                description="Detail-heavy reset for grease, grout, and built-up dust — ideal before guests or after busy stretches."
                learnMoreHref={p["deep-cleaning-cape-town"].path}
                bookSource="services_hub_card_deep"
                seoHubTrack
              />
              <ServiceCard
                icon={<DoorOpen className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Move-out Cleaning"
                description="Handover-focused scope for ovens, bathrooms, floors, and inspection-heavy zones."
                learnMoreHref={p["move-out-cleaning-cape-town"].path}
                bookSource="services_hub_card_moveout"
                seoHubTrack
              />
              <ServiceCard
                icon={<Home className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Airbnb Cleaning"
                description="Turnover-ready resets between guests — presentation, hygiene, and speed when calendars are tight."
                learnMoreHref={p["airbnb-cleaning-cape-town"].path}
                bookHref="/booking"
                bookSource="services_hub_card_airbnb"
                seoHubTrack
              />
              <ServiceCard
                icon={<Building2 className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Office Cleaning"
                description="Small workspaces and studios — desks, kitchens, bathrooms, and floors clients actually see."
                learnMoreHref={p["office-cleaning-cape-town"].path}
                bookSource="services_hub_card_office"
                seoHubTrack
              />
              <ServiceCard
                icon={<Layers className="size-5" strokeWidth={1.75} aria-hidden />}
                title="Carpet Cleaning"
                description="Refresh high-traffic rugs and carpets — book standalone or alongside a wider home visit."
                learnMoreHref={p["carpet-cleaning-cape-town"].path}
                bookSource="services_hub_card_carpet"
                seoHubTrack
              />
            </div>
          </Section>
        </section>

        {/* How it works */}
        <section className="border-t border-zinc-100 bg-white" aria-labelledby="how-heading">
          <Section>
            <h2 id="how-heading" className="text-2xl font-bold tracking-tight text-blue-950 md:text-3xl">
              How it works
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 md:text-base">Three steps — most people finish in under five minutes.</p>
            <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {[
                {
                  step: "1",
                  title: "Enter your details",
                  body: "Address, rooms, bathrooms, and access notes — so routing and time on site stay accurate.",
                  Icon: ClipboardList,
                },
                {
                  step: "2",
                  title: "Choose your service",
                  body: "Standard, deep, move-out, Airbnb, office, or carpet — compare scope on each guide if you need detail.",
                  Icon: ListChecks,
                },
                {
                  step: "3",
                  title: "Book instantly",
                  body: "See your total, pick a slot, and pay securely online — adjust add-ons until it matches your budget.",
                  Icon: CalendarCheck,
                },
              ].map(({ step, title, body, Icon }) => (
                <div
                  key={step}
                  className="relative rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {step}
                    </span>
                    <Icon className="size-6 text-blue-800" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-blue-950">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
                </div>
              ))}
            </div>
          </Section>
        </section>

        {/* Pricing preview */}
        <section className="border-t border-zinc-100 bg-zinc-50/80" aria-labelledby="pricing-heading">
          <Section>
            <h2 id="pricing-heading" className="text-2xl font-bold tracking-tight text-blue-950 md:text-3xl">
              How much does cleaning cost?
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-700">
              Cleaning services in Cape Town typically cost between <strong className="font-semibold text-blue-900">R300</strong> and{" "}
              <strong className="font-semibold text-blue-900">R900</strong> depending on your home size and service type.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Small home", hint: "Compact apartment / fewer wet rooms", from: "R300" },
                { label: "Medium home", hint: "Typical 2–3 bed layouts", from: "R500" },
                { label: "Large home", hint: "More bedrooms, baths, or deep scope", from: "R800" },
              ].map((tier) => (
                <div
                  key={tier.label}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{tier.label}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-blue-950">From {tier.from}</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">{tier.hint}</p>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <CTAButton
                href="/booking/details"
                variant="primary"
                trackSource="services_hub_pricing_cta"
                seoHubCta={{ cta_location: "pricing", cta_label: "Get exact price", cta_kind: "get_price" }}
                seoPricingInteraction={{ interaction: "get_exact_price_click", label: "Get exact price" }}
                className="rounded-xl px-8"
              >
                Get exact price →
              </CTAButton>
            </div>
          </Section>
        </section>

        {/* Trust strip */}
        <section className="border-y border-zinc-200 bg-white" aria-label="Trust signals">
          <Section spacing="tight">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-2 text-sm font-medium text-blue-950 md:justify-between md:text-[15px]">
              <div className="flex items-center gap-2">
                <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
                <span>{GOOGLE_BUSINESS_REVIEWS.rating} average rating</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-blue-600" aria-hidden />
                <span>Background-checked cleaners</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="size-5 text-blue-700" aria-hidden />
                <span>Thousands of Cape Town homes served</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="size-5 text-blue-700" aria-hidden />
                <span>Secure online booking</span>
              </div>
            </div>
          </Section>
        </section>

        {/* Accordions */}
        <section className="border-t border-zinc-100 bg-white" aria-labelledby="included-heading">
          <Section>
            <ServicesHubAccordions
              serviceDetails={[...serviceDetails]}
              faqs={SERVICES_HUB_FAQS}
              faqAnalytics={{ page_slug: "services", suburb: "Cape Town" }}
            />
          </Section>
        </section>

        {/* Areas */}
        <section className="border-t border-zinc-100 bg-zinc-50/80" aria-labelledby="areas-heading">
          <Section>
            <h2 id="areas-heading" className="text-2xl font-bold tracking-tight text-blue-950 md:text-3xl">
              Areas we serve
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 md:text-base">
              Browse suburb hubs for local context — each links to the same Cape Town-wide booking flow.
            </p>
            <ServicesAreasSection groups={areaGroups} />
          </Section>
        </section>

        {/* Final CTA */}
        <section className="border-t border-blue-900 bg-blue-800 text-white" aria-labelledby="final-cta-heading">
          <Section className="py-16 md:py-20">
            <h2 id="final-cta-heading" className="text-2xl font-bold tracking-tight md:text-3xl">
              Ready to book a cleaner?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-300 md:text-base">
              Lock scope and pricing online — adjust rooms and extras until your total matches what you need.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CTAButton
                href="/booking/details"
                variant="primary"
                trackSource="services_hub_footer_book"
                seoHubCta={{ cta_location: "footer", cta_label: "Book now", cta_kind: "book_now" }}
                className="rounded-xl bg-white text-blue-900 hover:bg-blue-50"
              >
                Book now
              </CTAButton>
              <CTAButton
                href="/booking/details"
                variant="ghostOnDark"
                trackSource="services_hub_footer_price"
                seoHubCta={{ cta_location: "footer", cta_label: "Get instant price", cta_kind: "get_price" }}
                className="rounded-xl"
              >
                Get instant price
              </CTAButton>
            </div>
          </Section>
        </section>

        <Section spacing="tight" className="pb-16 pt-10">
          <RelatedLinks placement="services_hub" />
        </Section>
      </main>

      <ServicesStickyMobileCta />
    </MarketingLayout>
  );
}
