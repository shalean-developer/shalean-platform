import type { Metadata } from "next";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { FaqFinalCta } from "@/components/faq/FaqFinalCta";
import { FaqHero } from "@/components/faq/FaqHero";
import { FaqPageExperience } from "@/components/faq/FaqPageExperience";
import { FaqStickyMobileCta } from "@/components/faq/FaqStickyMobileCta";
import { FaqTrustStrip } from "@/components/faq/FaqTrustStrip";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { flattenAllFaqItems } from "@/lib/faq/faq-page-data";
import { buildFaqPageJsonLd } from "@/lib/faq/faq-jsonld";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
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
const FAQ_TWITTER_DESC = clampMetaDescription(
  "Pricing, booking, supplies, and trust—quick answers before you lock a quote.",
);

export const metadata: Metadata = {
  title: "Cleaning Service FAQs | Pricing, Booking & Trust | Shalean Cape Town",
  description: FAQ_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "Cleaning Service FAQs | Shalean Cape Town",
    description: FAQ_OG_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Service FAQs | Shalean Cape Town",
    description: FAQ_TWITTER_DESC,
  },
};

export default function FaqPage() {
  const bookingHref = marketingHomeBookingHref();
  const faqJsonLd = buildFaqPageJsonLd(flattenAllFaqItems());

  return (
    <div className="bg-white text-zinc-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "faq", content_group: "marketing_faq", primary_kw: "cleaning FAQ Cape Town" }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <FaqHero />
        <FaqPageExperience />
        <FaqTrustStrip />
        <FaqFinalCta />
      </main>
      <MarketingHomeFooter />
      <FaqStickyMobileCta />
    </div>
  );
}
