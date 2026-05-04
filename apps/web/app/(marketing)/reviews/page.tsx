import type { Metadata } from "next";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { MarketingGoogleReviewsBand } from "@/components/marketing-home/sections/MarketingGoogleReviewsBand";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const REVIEWS_CANONICAL = absoluteCanonicalUrl("/reviews");

export const metadata: Metadata = {
  title: "Google Reviews | Shalean Cleaning Services Cape Town",
  description:
    "See Shalean’s Google Business Profile rating and verified homeowner feedback—punctual teams, clear quotes, and thorough cleans across Cape Town.",
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: REVIEWS_CANONICAL },
  openGraph: {
    type: "website",
    url: REVIEWS_CANONICAL,
    title: "Google Reviews | Shalean Cleaning Services Cape Town",
    description:
      "Verified homeowner feedback—punctual teams, clear quotes, and thorough cleans across Cape Town.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Google Reviews | Shalean Cleaning Services Cape Town",
    description:
      "See Shalean’s Google rating and real customer feedback for Cape Town home cleaning.",
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
      <MarketingHomeFooter />
    </div>
  );
}
