import Link from "next/link";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { getPublishedReviews } from "@/lib/reviews/publishedReviews";
import { reviewsPagePath } from "@/lib/reviews/reviewPagination";
import { PublicReviewCards } from "./PublicReviewCards";

export async function PublishedReviewsSection({ page }: { page: number }) {
  const result = await getPublishedReviews(page);
  return <HomeSection containerSize="marketing" aria-label="Customer reviews across all ratings">
    <MarketingSectionHeader eyebrow="Customer feedback" title="Customer reviews across all ratings"
      description="Written feedback from completed Shalean bookings, published with customer permission. Reviews from one to five stars are eligible, shown newest first." />
    {result?.reviews.length ? <PublicReviewCards reviews={result.reviews} /> : <p className="mt-8 text-muted-foreground">{result ? "No published reviews on this page yet." : "Customer reviews are temporarily unavailable. Please try again later."}</p>}
    {result && (result.page > 1 || result.hasMore) ? <nav aria-label="Customer review pages" className="mt-8 flex flex-wrap items-center gap-6 text-sm">
      {result.page > 1 ? <Link href={reviewsPagePath(result.page - 1)} className="text-sky-800 underline underline-offset-4">Newer reviews</Link> : null}
      <span aria-current="page">Page {result.page}</span>
      {result.hasMore ? <Link href={reviewsPagePath(result.page + 1)} className="text-sky-800 underline underline-offset-4">Older reviews</Link> : null}
    </nav> : null}
  </HomeSection>;
}
