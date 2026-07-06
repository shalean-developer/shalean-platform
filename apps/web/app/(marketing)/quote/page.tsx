import type { Metadata } from "next";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { QuotePageFooter } from "@/components/quote/QuotePageFooter";
import { QuotePageHeader } from "@/components/quote/QuotePageHeader";
import { QuoteRequestForm } from "@/components/quote/QuoteRequestForm";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/quote";
const CANONICAL = absoluteCanonicalUrl(PATH);

const QUOTE_TITLE = "Get a Free Cleaning Quote | Shalean Cape Town";
const QUOTE_META_DESC = clampMetaDescription(
  "Request a free, no-obligation cleaning quote for your home or office in Cape Town. Tell us what you need — we'll email your personalised quote.",
);
const QUOTE_OG_DESC = clampMetaDescription(
  "Free cleaning quotes for Cape Town homes and offices — personalised pricing from Shalean.",
);

export const metadata: Metadata = {
  title: QUOTE_TITLE,
  description: QUOTE_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Get a Free Cleaning Quote | Shalean",
    description: QUOTE_OG_DESC,
    imageAlt: "Request a free cleaning quote from Shalean Cape Town",
  }),
};

export default function QuoteRequestPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "quote_request", content_group: "marketing_quote" }}
      />
      <QuotePageHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Free quote</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Get your free cleaning quote
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            Tell us about your home or office and we&apos;ll send a personalised quote by email. No account
            required — accept and pay online when you&apos;re ready.
          </p>
        </div>
        <QuoteRequestForm />
        <p className="mt-8 text-center text-sm text-slate-500">
          Need a price right now?{" "}
          <a href="/book" className="font-semibold text-blue-600 hover:underline">Get an instant price online</a>
        </p>
      </main>
      <QuotePageFooter />
    </div>
  );
}
