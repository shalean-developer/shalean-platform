import type { Metadata } from "next";
import Link from "next/link";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
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

const QUOTE_TITLE = "Request a Cleaning Quote | Shalean Cape Town";
const QUOTE_META_DESC = clampMetaDescription(
  "Request a personalised, no-obligation cleaning quote for a custom home, office or recurring cleaning job in Cape Town. Shalean will review your scope and reply by email.",
);
const QUOTE_OG_DESC = clampMetaDescription(
  "Personalised cleaning quotes for custom Cape Town homes, offices and recurring cleaning requirements.",
);

export const metadata: Metadata = {
  title: QUOTE_TITLE,
  description: QUOTE_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Request a Cleaning Quote | Shalean",
    description: QUOTE_OG_DESC,
    imageAlt: "Request a personalised cleaning quote from Shalean Cape Town",
  }),
};

const JSON_LD = buildMarketingWebPageJsonLd({
  path: PATH,
  name: QUOTE_TITLE,
  description: QUOTE_META_DESC,
  breadcrumbLabel: "Request a Quote",
  includeLocalBusinessNode: true,
});

export default function QuoteRequestPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "quote_request", content_group: "marketing_quote" }}
      />
      <QuotePageHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Personalised quote</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Request a cleaning quote
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            Use this form for unusual properties, offices, recurring schedules or jobs that need a custom scope. We&apos;ll review your requirements and email a personalised quote.
          </p>
          <div className="mx-auto mt-5 max-w-xl rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Need a standard price immediately?{" "}
            <Link href="/book" className="font-bold text-blue-700 hover:underline">
              See your instant online price instead
            </Link>
            .
          </div>
        </div>
        <QuoteRequestForm />
      </main>
      <QuotePageFooter />
    </div>
  );
}
