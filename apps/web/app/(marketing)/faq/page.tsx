import type { Metadata } from "next";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
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
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

const PATH = "/faq";
const CANONICAL = absoluteCanonicalUrl(PATH);

export const metadata: Metadata = {
  title: "Cleaning Service FAQs | Pricing, Booking & Trust | Shalean Cape Town",
  description:
    "FAQ for Shalean home cleaning in Cape Town—pricing bands, what’s included, same-day booking, supplies, vetting, insurance, and cancellations. Get instant quotes online.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "Cleaning Service FAQs | Shalean Cape Town",
    description:
      "Straight answers on pricing, standard vs deep cleans, same-day slots, supplies, trust, and logistics—then book with transparent totals.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Service FAQs | Shalean Cape Town",
    description: "Pricing, booking, supplies, and trust—quick answers before you lock a quote.",
  },
};

export default function FaqPage() {
  const bookingHref = marketingHomeBookingHref();
  const faqJsonLd = buildFaqPageJsonLd(flattenAllFaqItems());

  return (
    <div className="bg-white text-zinc-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <GrowthTracking
        event="page_view"
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
