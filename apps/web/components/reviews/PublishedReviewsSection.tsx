import Link from "next/link";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { getPublishedReviews } from "@/lib/reviews/publishedReviews";
import { reviewsPagePath } from "@/lib/reviews/reviewPagination";
import { PublicReviewCards } from "./PublicReviewCards";
import { getBookingReviewSummary } from "@/lib/reviews/bookingReviewSummary";
import { BookingReviewSummaryCard } from "./ReviewSourcePanels";

export async function PublishedReviewsSection({ page }: { page: number }) {
  const [result, summary] = await Promise.all([getPublishedReviews(page), getBookingReviewSummary()]);
  return <HomeSection id="booking-reviews" className="scroll-mt-28" containerSize="marketing" aria-label="Reviews from Shalean bookings">
    <MarketingSectionHeader eyebrow="Shared directly with Shalean" title="Reviews from Shalean bookings"
      description="Read feedback from completed cleaning bookings across all star ratings, shown newest first. Names, services and suburbs appear only with customer permission." />
    <BookingReviewSummaryCard summary={summary} />
    {result?.reviews.length ? <PublicReviewCards reviews={result.reviews} showSource /> : <p className="mt-8 text-muted-foreground">{result ? "No published reviews on this page yet." : "Customer reviews are temporarily unavailable. Please try again later."}</p>}
    {result && (result.page > 1 || result.hasMore) ? <nav aria-label="Customer review pages" className="mt-8 flex flex-wrap items-center gap-6 text-sm">
      {result.page > 1 ? <Link href={reviewsPagePath(result.page - 1)} className="text-sky-800 underline underline-offset-4">Newer reviews</Link> : null}
      <span aria-current="page">Page {result.page}</span>
      {result.hasMore ? <Link href={reviewsPagePath(result.page + 1)} className="text-sky-800 underline underline-offset-4">Older reviews</Link> : null}
    </nav> : null}
  </HomeSection>;
}
