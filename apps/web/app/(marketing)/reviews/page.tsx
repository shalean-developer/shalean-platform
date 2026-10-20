import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedReviews } from "@/lib/reviews/publishedReviews";
import { parseReviewsPage, reviewsPagePath } from "@/lib/reviews/reviewPagination";
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

type Props = { searchParams: Promise<{ page?: string | string[] }> };

const REVIEWS_META_DESC = clampMetaDescription(
  "Read reviews from completed Shalean cleaning bookings in Cape Town across all star ratings. Explore customer feedback and our separate Google review profile.",
);
const REVIEWS_OG_DESC = clampMetaDescription(
  "Read genuine Shalean booking reviews from Cape Town customers across all star ratings, with a separate link to our Google Business Profile reviews.",
);
const REVIEWS_TWITTER_DESC = REVIEWS_META_DESC;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parseReviewsPage((await searchParams).page);
  const REVIEWS_CANONICAL = absoluteCanonicalUrl(reviewsPagePath(page));
  return {
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
}

export default async function ReviewsPage({ searchParams }: Props) {
  const page = parseReviewsPage((await searchParams).page);
  if (page > 1) {
    const result = await getPublishedReviews(page);
    if (result && !result.reviews.length) notFound();
  }
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-background text-foreground">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={marketingWhatsAppFloatMainPadding}>
        <ReviewsPageContent page={page} />
      </main>
      <SiteFooter />
    </div>
  );
}
