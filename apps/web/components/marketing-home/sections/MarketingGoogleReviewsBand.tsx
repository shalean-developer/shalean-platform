import Link from "next/link";
import { Star } from "lucide-react";
import {
  getGoogleReviewWriteUrl,
  GOOGLE_BUSINESS_REVIEWS,
  googleReviewsMarketingHeadline,
} from "@/lib/seo/googleReviews";
import { linkInParagraphClassName } from "@/lib/ui/linkClassNames";

const SNIPPET =
  "Homeowners across Cape Town mention punctual teams, clear quotes, and thorough kitchens — see why we earn strong feedback on Google.";

/** Homepage band: live Google aggregate + optional link to leave a review. */
export function MarketingGoogleReviewsBand() {
  const googleWrite = getGoogleReviewWriteUrl();

  return (
    <section
      className="border-y border-slate-200 bg-gradient-to-r from-slate-50 to-white py-12 md:py-14"
      aria-labelledby="google-reviews-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="min-w-0 flex-1">
            <p id="google-reviews-heading" className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Google reviews
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className="flex items-center gap-0.5 text-amber-400"
                aria-label={`${GOOGLE_BUSINESS_REVIEWS.rating} out of 5 stars on Google`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`size-6 ${n <= 4 ? "fill-amber-400 text-amber-400" : "fill-amber-400/85 text-amber-400"}`}
                    strokeWidth={n <= 4 ? 0 : 1}
                  />
                ))}
              </span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">{GOOGLE_BUSINESS_REVIEWS.rating}</span>
              <span className="text-sm font-medium text-slate-600">{googleReviewsMarketingHeadline()}</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">{SNIPPET}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            <div className="rounded-2xl border border-sky-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trust</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {GOOGLE_BUSINESS_REVIEWS.rating}⭐ · {GOOGLE_BUSINESS_REVIEWS.count}+ reviews
              </p>
              <p className="mt-1 text-xs text-slate-600">Verified on Google Business Profile</p>
            </div>
            {googleWrite ? (
              <a
                href={googleWrite}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-600 px-5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                Leave a Google review
              </a>
            ) : (
              <Link
                href="/review"
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 ${linkInParagraphClassName}`}
              >
                Rate your visit
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
