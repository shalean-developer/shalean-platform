import Link from "next/link";
import { Star, MessageSquareText } from "lucide-react";
import {
  GOOGLE_BUSINESS_REVIEWS,
  googleReviewsBasedOnCountLine,
} from "@/lib/seo/googleReviews";

export function MarketingHomeAboutSection() {
  return (
    <section id="customer-proof" className="scroll-mt-24 bg-white py-14 md:py-16" aria-labelledby="customer-proof-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Customer proof</p>
          <h2 id="customer-proof-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Rated by customers on Google
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            The homepage review figures use the same verified Google Business Profile aggregate as Shalean&apos;s structured data.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-1" aria-label={`${GOOGLE_BUSINESS_REVIEWS.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
              ))}
            </div>
            <p className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">
              {GOOGLE_BUSINESS_REVIEWS.rating}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Google rating</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{googleReviewsBasedOnCountLine()}</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
              <MessageSquareText className="h-5 w-5 text-blue-600" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">
              {GOOGLE_BUSINESS_REVIEWS.count}+
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Google reviews</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Browse Shalean&apos;s review page for customer feedback and review information.
            </p>
            <Link
              href="/reviews"
              className="mt-5 inline-flex text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              View reviews →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
