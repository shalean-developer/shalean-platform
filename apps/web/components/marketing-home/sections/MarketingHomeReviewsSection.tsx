import { Star } from "lucide-react";
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
        description="Feedback shared directly with Shalean after completed cleaning bookings. Published anonymously with permission."
      />
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <figure key={review.id} className="m-0 flex flex-col rounded-xl border border-border bg-white p-6 shadow-sm">
            <div className="mb-4 flex gap-1 text-amber-500" role="img" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }, (_, i) => <Star key={i} className="h-5 w-5 fill-current" aria-hidden="true" />)}
            </div>
            <blockquote className="m-0 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">{review.comment}</blockquote>
            <figcaption className="mt-5 text-sm text-muted-foreground">
              <span className="block font-semibold text-foreground">Verified customer</span>
              <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" })}</time>
            </figcaption>
          </figure>
        ))}
      </div>
    </HomeSection>
  );
}
