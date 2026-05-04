import Link from "next/link";
import { Star } from "lucide-react";
import { getGoogleReviewWriteUrl, GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

const SNIPPET =
  "Homeowners across Cape Town mention punctual teams, clear quotes, and thorough kitchens — see why we earn strong feedback on Google.";

const trustCardClass =
  "rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm";
const ctaCardClass =
  "flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-center text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";

/** Homepage strip below blue trust banner: compact Google trust badge + rate CTA (matches marketing reference layout). */
export function MarketingGoogleReviewsBand() {
  const googleWrite = getGoogleReviewWriteUrl();
  const { rating, count } = GOOGLE_BUSINESS_REVIEWS;

  return (
    <section
      className="border-b border-slate-200 bg-white py-10 md:py-12"
      aria-labelledby="google-reviews-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-2xl text-center lg:min-w-0 lg:flex-1 lg:text-left">
            <p id="google-reviews-heading" className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Google reviews
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 md:text-base">{SNIPPET}</p>
          </div>

          <div
            className="flex w-full max-w-[300px] flex-col gap-2.5 lg:mx-0 lg:w-[300px] lg:shrink-0"
            aria-label="Google Business Profile rating summary"
          >
            <div className={trustCardClass}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-800">Trust</p>
              <p
                className="mt-2 text-base font-bold leading-snug text-slate-900"
                aria-label={`Rated ${rating} out of 5 average for cleaning services in Cape Town`}
              >
                Rated <span className="tabular-nums">{rating} / 5</span> average for cleaning services in Cape Town
              </p>
              <p className="mt-2 text-sm font-semibold leading-snug text-slate-800">
                <span className="tabular-nums">{count}+</span> verified Google reviews · From homeowners across Cape Town
              </p>
              <p className="mt-2 flex items-start gap-2 text-xs leading-snug text-slate-500">
                <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
                <span>Verified on Google Business Profile</span>
              </p>
            </div>

            {googleWrite ? (
              <a href={googleWrite} target="_blank" rel="noopener noreferrer" className={ctaCardClass}>
                Rate your visit
              </a>
            ) : (
              <Link href="/review" className={ctaCardClass}>
                Rate your visit
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
