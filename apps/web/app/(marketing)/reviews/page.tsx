import type { Metadata } from "next";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingGoogleReviewsBand } from "@/components/marketing-home/sections/MarketingGoogleReviewsBand";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const REVIEWS_CANONICAL = absoluteCanonicalUrl("/reviews");

const REVIEWS_META_DESC = clampMetaDescription(
  "See Shalean’s Google Business Profile rating and verified homeowner feedback—punctual teams, clear quotes, and thorough cleans across Cape Town.",
);
const REVIEWS_OG_DESC = clampMetaDescription(
  "Verified homeowner feedback—punctual teams, clear quotes, and thorough cleans across Cape Town.",
);
const REVIEWS_TWITTER_DESC = clampMetaDescription(
  "See Shalean’s Google rating and real customer feedback for Cape Town home cleaning.",
);

export const metadata: Metadata = {
  title: "Google Reviews | Shalean Cleaning Services Cape Town",
  description: REVIEWS_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: REVIEWS_CANONICAL },
  openGraph: {
    type: "website",
    url: REVIEWS_CANONICAL,
    title: "Google Reviews | Shalean Cleaning Services Cape Town",
    description: REVIEWS_OG_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: "Google Reviews | Shalean Cleaning Services Cape Town",
    description: REVIEWS_TWITTER_DESC,
  },
};

export default function ReviewsPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-slate-900">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main>
        <MarketingGoogleReviewsBand />
      </main>
      <FooterSection />
    </div>
  );
}