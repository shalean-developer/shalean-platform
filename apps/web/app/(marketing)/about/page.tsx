import type { Metadata } from "next";
import { AboutPageView } from "@/components/about/AboutPageView";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/about";
const CANONICAL = absoluteCanonicalUrl(PATH);
const ABOUT_TITLE = clipSerpTitle("About Shalean | Trusted Home Cleaning Cape Town");
const ABOUT_META_DESC = clampMetaDescription(
  "Vetted cleaners, transparent pricing, and reliable home cleaning across Cape Town. Learn how Shalean works and book online with upfront quotes.",
);
const ABOUT_OG_DESC = clampMetaDescription(
  "Background-checked teams, clear totals before payment, and service across Cape Town—book standard, deep, or move-out cleaning online.",
);
const ABOUT_TWITTER_DESC = clampMetaDescription(
  "Why homeowners choose Shalean: vetted cleaners, transparent pricing, same-day when routing allows.",
);

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL, languages: { "en-ZA": CANONICAL } },
  openGraph: {
    type: "website",
    url: CANONICAL,
    locale: "en_ZA",
    siteName: "Shalean Cleaning Services",
    title: ABOUT_TITLE,
    description: ABOUT_OG_DESC,
    images: [
      {
        url: HOME_OG_IMAGE,
        width: HOME_OG_IMAGE_WIDTH,
        height: HOME_OG_IMAGE_HEIGHT,
        alt: "Shalean Cleaning Services Cape Town",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ABOUT_TITLE,
    description: ABOUT_TWITTER_DESC,
    images: [HOME_OG_IMAGE],
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