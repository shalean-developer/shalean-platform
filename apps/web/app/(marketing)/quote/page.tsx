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

export default function QuoteRequestPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
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

          <div className="mx-auto mt-6 w-full max-w-[560px] text-center sm:mt-8">
            <p className="text-sm leading-6 text-slate-600">
              <span className="font-medium text-slate-700">Our cleaning services:</span>{" "}
              {SERVICE_LINKS.map((service, index) => (
                <span key={service.href}>
                  <Link href={service.href} className="font-semibold text-blue-700 hover:underline">
                    {service.label}
                  </Link>
                  {index < SERVICE_LINKS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </div>
        </PublicPageContainer>
      </main>

      <QuotePageFooter />
    </div>
  );
}
