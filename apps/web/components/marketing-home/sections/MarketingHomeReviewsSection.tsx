import Link from "next/link";
import { reviewServicePresentation } from "@/lib/reviews/publicReviewDetails";
import { Quote, Star } from "lucide-react";
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
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => {
          const service = reviewServicePresentation(review.serviceKey);
          const name = review.displayName || "Verified customer";
          return (
            <figure key={review.id} className="relative m-0 flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm">
              <Quote className="absolute right-5 top-5 h-8 w-8 text-sky-100" aria-hidden="true" />
              <div className="mb-4 flex gap-1 text-amber-500" role="img" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }, (_, i) => <Star key={i} className="h-5 w-5 fill-current" aria-hidden="true" />)}
              </div>
              <blockquote className="m-0 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">{review.comment}</blockquote>
              <figcaption className="mt-5 text-sm text-muted-foreground">
                <div className="mb-2 flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 font-semibold text-sky-800">{review.displayName ? name.split(" ").map((part) => part[0]).join("").slice(0, 2) : "VC"}</span>
                  <span className="font-semibold text-foreground">{name}</span>
                </div>
                {service || review.suburb ? <p className="mb-2">{service ? <Link href={service.href} className="text-sky-800 underline decoration-sky-200 underline-offset-4 hover:decoration-sky-800">{service.title}</Link> : null}{service && review.suburb ? " · " : null}{review.suburb}</p> : null}
                <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" })}</time>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </HomeSection>
  );
}
