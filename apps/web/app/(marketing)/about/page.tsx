import type { Metadata } from "next";
import { AboutPageView } from "@/components/about/AboutPageView";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/about";
const CANONICAL = absoluteCanonicalUrl(PATH);
const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";
const ABOUT_META_DESC = clampMetaDescription(
  "Vetted cleaners, transparent pricing, and reliable home cleaning across Cape Town. Learn how Shalean works and book online with upfront quotes.",
);
const ABOUT_OG_DESC = clampMetaDescription(
  "Background-checked teams, clear totals before payment, and suburb hubs across the metro—book standard, deep, or move-out cleaning.",
);
const ABOUT_TWITTER_DESC = clampMetaDescription(
  "Why homeowners choose Shalean: vetted cleaners, transparent pricing, same-day when routing allows.",
);

export const metadata: Metadata = {
  title: "About Shalean | Trusted Home Cleaning Cape Town",
  description: ABOUT_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "About Shalean | Trusted Home Cleaning Cape Town",
    description: ABOUT_OG_DESC,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Shalean Cleaning Services Cape Town",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Shalean | Trusted Home Cleaning Cape Town",
    description: ABOUT_TWITTER_DESC,
    images: [OG_IMAGE],
  },
};

export default function AboutPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-zinc-900">
      <GrowthTracking
        event={ANALYTICS_EVENTS.PAGE_VIEW}
        payload={{ page_type: "about", content_group: "marketing_about", primary_kw: "Shalean cleaning Cape Town" }}
      />
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <AboutPageView />
      </main>
      <FooterSection />
    </div>
  );
}