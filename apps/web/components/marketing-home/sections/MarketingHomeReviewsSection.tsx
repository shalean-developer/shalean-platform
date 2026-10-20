import { PublicReviewCards } from "@/components/reviews/PublicReviewCards";
import Link from "next/link";
import { getHomepageReviews } from "@/lib/reviews/homepageReviews";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

export async function MarketingHomeReviewsSection() {
  const reviews = await getHomepageReviews();
  if (!reviews.length) return null;
  return (
    <HomeSection containerSize="marketing" aria-label="Selected five-star customer reviews">
      <MarketingSectionHeader
        eyebrow="Customer feedback"
        title="Selected five-star customer reviews"
        description="Feedback shared directly with Shalean after completed cleaning bookings. Published with customer permission. Only selected five-star written reviews are featured."
      />
      <PublicReviewCards reviews={reviews} />
      <p className="mt-8"><Link href="/reviews" className="font-semibold text-sky-800 underline underline-offset-4">Read customer reviews across all ratings</Link></p>
    </HomeSection>
  );
}
