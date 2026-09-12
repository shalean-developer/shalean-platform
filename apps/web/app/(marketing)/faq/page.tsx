import type { Metadata } from "next";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { FaqFinalCta } from "@/components/faq/FaqFinalCta";
import { FaqHero } from "@/components/faq/FaqHero";
import { FaqPageExperience } from "@/components/faq/FaqPageExperience";
import { FaqStickyMobileCta } from "@/components/faq/FaqStickyMobileCta";
import { FaqTrustStrip } from "@/components/faq/FaqTrustStrip";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { marketingStickyCtaMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { flattenAllFaqItems } from "@/lib/faq/faq-page-data";
import { buildFaqPageJsonLd } from "@/lib/faq/faq-jsonld";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/faq";
const CANONICAL = absoluteCanonicalUrl(PATH);

const FAQ_META_DESC = clampMetaDescription(
  "FAQ for Shalean home cleaning in Cape Town—pricing bands, what’s included, same-day booking, supplies, vetting, insurance, and cancellations. Get instant quotes online.",
);
const FAQ_OG_DESC = clampMetaDescription(
  "Straight answers on pricing, standard vs deep cleans, same-day slots, supplies, trust, and logistics—then book with transparent totals.",
);

const FAQ_PAGE_TITLE = clipSerpTitle("Cleaning FAQs Cape Town | Pricing & Booking | Shalean");

export const metadata: Metadata = {
  title: FAQ_PAGE_TITLE,
  description: FAQ_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: FAQ_PAGE_TITLE,
    description: FAQ_OG_DESC,
    imageAlt: "Shalean cleaning FAQs — Cape Town pricing and booking",
  }),
};
export default function FaqPage() {
  const bookingHref = marketingHomeBookingHref();
  const faqJsonLd = buildFaqPageJsonLd(flattenAllFaqItems());

  return (
    <div className="bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "faq", content_group: "marketing_faq", primary_kw: "cleaning FAQ Cape Town" }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={marketingStickyCtaMainPadding}>
        <FaqHero />
        <FaqPageExperience />
        <FaqTrustStrip />
        <FaqFinalCta />
      </main>
      <SiteFooter />
      <FaqStickyMobileCta />
    </div>
  );
}
