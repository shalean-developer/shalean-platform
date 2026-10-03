import type { Metadata } from "next";
import Link from "next/link";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { QuotePageFooter } from "@/components/quote/QuotePageFooter";
import { QuotePageHeader } from "@/components/quote/QuotePageHeader";
import { QuoteRequestForm } from "@/components/quote/QuoteRequestForm";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { buildMarketingWebPageJsonLd } from "@/lib/seo/marketingWebPageJsonLd";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/quote";
const CANONICAL = absoluteCanonicalUrl(PATH);

const QUOTE_TITLE = "Free Cleaning Quote Cape Town | Shalean Cleaning Services";
const QUOTE_META_DESC = clampMetaDescription(
  "Get a free cleaning quote in Cape Town for regular, deep, move-in/out, office, Airbnb or carpet cleaning. Tell Shalean what you need for a personalised quote.",
);
const QUOTE_OG_DESC = clampMetaDescription(
  "Request a free personalised cleaning quote in Cape Town for homes, offices, Airbnb properties, moving cleans and carpet cleaning.",
);

const SERVICE_LINKS = [
  { href: "/services/standard-cleaning-cape-town", label: "Regular cleaning" },
  { href: "/services/deep-cleaning-cape-town", label: "Deep cleaning" },
  { href: "/services/move-out-cleaning-cape-town", label: "Move-in / out cleaning" },
  { href: "/services/office-cleaning-cape-town", label: "Office cleaning" },
  { href: "/services/airbnb-cleaning-cape-town", label: "Airbnb cleaning" },
  { href: "/services/carpet-cleaning-cape-town", label: "Carpet cleaning" },
] as const;

const QUOTE_FAQS = [
  {
    question: "Is the cleaning quote free?",
    answer:
      "Yes. There is no payment required to request a personalised cleaning quote from Shalean.",
  },
  {
    question: "What cleaning services can I request a quote for?",
    answer:
      "You can request a quote for regular, deep, move-in or move-out, office, Airbnb and carpet cleaning in Cape Town.",
  },
  {
    question: "Can I get an instant price instead of requesting a quote?",
    answer:
      "Yes. If you prefer live online pricing and availability, use Shalean's online booking flow instead of the personalised quote form.",
  },
] as const;

export const metadata: Metadata = {
  title: QUOTE_TITLE,
  description: QUOTE_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Free Cleaning Quote Cape Town | Shalean",
    description: QUOTE_OG_DESC,
    imageAlt: "Request a free personalised cleaning quote from Shalean in Cape Town",
  }),
};

const JSON_LD = buildMarketingWebPageJsonLd({
  path: PATH,
  name: QUOTE_TITLE,
  description: QUOTE_META_DESC,
  breadcrumbLabel: "Cleaning Quote",
  includeLocalBusinessNode: true,
});

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${CANONICAL}#faq`,
  mainEntity: QUOTE_FAQS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function QuoteRequestPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "quote_request", content_group: "marketing_quote" }}
      />
      <QuotePageHeader />

      <main className="flex-1 py-8 sm:py-12">
        <PublicPageContainer size="content">
          <div className="mx-auto w-full max-w-[560px]">
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Get a cleaning quote in Cape Town
              </h1>
              <p className="mx-auto mt-3 text-base leading-relaxed text-muted-foreground">
                Tell us what you need and we&apos;ll prepare a personalised cleaning quote. No payment required.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Prefer live pricing and availability?{" "}
                <Link href="/book" className="font-semibold text-primary hover:underline">
                  Get an instant price →
                </Link>
              </p>
            </div>

            <QuoteRequestForm />
          </div>

          <div className="mx-auto mt-8 w-full max-w-3xl space-y-7 sm:mt-10">
            <section aria-labelledby="quote-services-heading">
              <h2 id="quote-services-heading" className="text-xl font-bold tracking-tight text-slate-900">
                Cleaning quotes for Cape Town
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                <span className="font-medium text-slate-700">Quotes available for:</span>{" "}
                {SERVICE_LINKS.map((service, index) => (
                  <span key={service.href}>
                    <Link href={service.href} className="font-semibold text-blue-700 hover:underline">
                      {service.label}
                    </Link>
                    {index < SERVICE_LINKS.length - 1 ? " · " : ""}
                  </span>
                ))}
              </p>
            </section>

            <section aria-labelledby="quote-factors-heading">
              <h2 id="quote-factors-heading" className="text-xl font-bold tracking-tight text-slate-900">
                What affects your quote?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Service type, property size, rooms, extras, location and preferred date can affect your personalised price.{" "}
                <Link href="/cleaning-prices-cape-town" className="font-semibold text-blue-700 hover:underline">
                  View cleaning prices →
                </Link>
              </p>
            </section>

            <section id="faq" aria-labelledby="quote-faq-heading">
              <h2 id="quote-faq-heading" className="text-xl font-bold tracking-tight text-slate-900">
                Common cleaning quote questions
              </h2>
              <div className="mt-4 space-y-2">
                {QUOTE_FAQS.map((item) => (
                  <details key={item.question} className="rounded-xl border border-slate-200 bg-white">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
                      {item.question}
                    </summary>
                    <p className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </PublicPageContainer>
      </main>

      <QuotePageFooter />
    </div>
  );
}
