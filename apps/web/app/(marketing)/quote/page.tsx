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
    <div className="flex min-h-dvh flex-col bg-muted/30 text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "quote_request", content_group: "marketing_quote" }}
      />
      <QuotePageHeader />
      <main className="flex-1 py-8 sm:py-12">
        <PublicPageContainer size="content" className="max-w-[560px]">
          <div className="mb-6 text-center sm:mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Request a cleaning quote
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
              Tell us what you need and we&apos;ll send you a personalised quote.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Need standard home cleaning?{" "}
              <Link href="/book" className="font-semibold text-primary hover:underline">
                Get an instant price →
              </Link>
            </p>
          </div>
          <QuoteRequestForm />
        </PublicPageContainer>
      </main>
      <QuotePageFooter />
    </div>
  );
}
