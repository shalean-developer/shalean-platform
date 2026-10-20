import { ExternalLink, Star } from "lucide-react";
import type { BookingReviewSummary } from "@/lib/reviews/bookingReviewSummary";
import { areGoogleBusinessReviewsFresh, getGoogleReviewWriteUrl, GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import { PUBLIC_BUSINESS_GOOGLE_PLACE_ID, PUBLIC_BUSINESS_GOOGLE_PROFILE_URL } from "@/lib/site/publicBusinessIdentity";

export function BookingReviewSummaryCard({ summary }: { summary: BookingReviewSummary | null }) {
  if (!summary || !summary.count || summary.average === null) return null;
  return <div aria-label="Shalean booking rating summary" className="mx-auto mt-8 max-w-2xl rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5 text-center">
    <p className="text-sm font-semibold text-sky-900">Shalean booking ratings</p>
    <p className="mt-2 flex flex-wrap items-baseline justify-center gap-2 text-slate-900"><Star className="h-6 w-6 self-center fill-amber-400 text-amber-500" aria-hidden="true" /><span className="text-3xl font-bold tabular-nums">{summary.average.toFixed(1)}</span><span>/ 5</span><span className="text-sm text-slate-600">from {summary.count} booking {summary.count === 1 ? "rating" : "ratings"}</span></p>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Ratings across all stars from completed Shalean bookings. Written reviews are published with customer permission.</p>
  </div>;
}

export function GoogleReviewPanel() {
  const googleWrite = getGoogleReviewWriteUrl() || `https://search.google.com/local/writereview?placeid=${PUBLIC_BUSINESS_GOOGLE_PLACE_ID}`;
  const showSnapshot = areGoogleBusinessReviewsFresh();
  const checkedAt = GOOGLE_BUSINESS_REVIEWS.verifiedAt;
  const checkedDate = new Date(`${checkedAt}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
  return <section aria-labelledby="google-review-source-heading" className="border-y border-slate-200 bg-slate-50 py-10 md:py-12">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 md:flex md:items-center md:justify-between md:gap-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Separate review source</p>
          <h2 id="google-review-source-heading" className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">Also reviewed on Google</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">Google reviews are posted on our Google Business Profile. They are separate from the Shalean booking reviews above.</p>
          {showSnapshot ? <>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-slate-900"><Star className="h-5 w-5 fill-amber-400 text-amber-500" aria-hidden="true" /><strong className="tabular-nums">{GOOGLE_BUSINESS_REVIEWS.rating} / 5</strong><span>· {GOOGLE_BUSINESS_REVIEWS.count} Google reviews</span></p>
            <p className="mt-2 text-xs text-slate-500">Last verified <time dateTime={checkedAt}>{checkedDate}</time>. See Google for the latest rating and reviews.</p>
          </> : <p className="mt-3 text-sm text-slate-600">See Google for the latest rating and reviews.</p>}
        </div>
        <div className="mt-6 flex shrink-0 flex-col items-start gap-3 md:mt-0">
          <a href={PUBLIC_BUSINESS_GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">Read our Google reviews<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          <a href={googleWrite} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-800 underline underline-offset-4">Review us on Google<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </div>
    </div>
  </section>;
}
