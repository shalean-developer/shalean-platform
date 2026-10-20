import type { Metadata } from "next";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { ReviewsPageContent } from "@/components/reviews/ReviewsPageContent";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const REVIEWS_CANONICAL = absoluteCanonicalUrl("/reviews");

const REVIEWS_META_DESC = clampMetaDescription(
  "Read selected five-star reviews from completed Shalean cleaning bookings in Cape Town, published with customer permission. See our separate Google rating.",
);
const REVIEWS_OG_DESC = clampMetaDescription(
  "Selected five-star customer feedback from completed Cape Town cleaning bookings, alongside Shalean’s separate Google Business Profile rating.",
);
const REVIEWS_TWITTER_DESC = REVIEWS_META_DESC;

export const metadata: Metadata = {
  title: "Customer Reviews | Shalean Cleaning Services Cape Town",
  description: REVIEWS_META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: REVIEWS_CANONICAL },
  openGraph: {
    type: "website",
    url: REVIEWS_CANONICAL,
    title: "Customer Reviews | Shalean Cleaning Services Cape Town",
    description: REVIEWS_OG_DESC,
    images: [
      {
        url: HOME_OG_IMAGE,
        width: HOME_OG_IMAGE_WIDTH,
        height: HOME_OG_IMAGE_HEIGHT,
        alt: HOME_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Customer Reviews | Shalean Cleaning Services Cape Town",
    description: REVIEWS_TWITTER_DESC,
    images: [HOME_OG_IMAGE],
  },
};

export default function ReviewsPage() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-background text-foreground">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={marketingWhatsAppFloatMainPadding}>
        <ReviewsPageContent />
      </main>
      <SiteFooter />
    </div>
  );
}
