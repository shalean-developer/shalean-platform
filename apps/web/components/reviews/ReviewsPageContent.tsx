import Link from "next/link";
import { Star } from "lucide-react";
import { AboutReviewsRotator } from "@/components/about/AboutReviewsRotator";
import { ReviewCard } from "@/components/about/ReviewCard";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ABOUT_REVIEWS } from "@/lib/about/about-page-content";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { buildReviewsPageJsonLd } from "@/lib/seo/reviewsPageJsonLd";
import {
  getGoogleReviewWriteUrl,
  GOOGLE_BUSINESS_REVIEWS,
  googleReviewsShortTrustLine,
} from "@/lib/seo/googleReviews";

export function ReviewsPageContent() {
  const bookingHref = marketingHomeBookingHref();
  const googleWrite = getGoogleReviewWriteUrl();
  const jsonLd = buildReviewsPageJsonLd();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-slate-200 bg-gradient-to-b from-sky-50/80 to-white py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Customer feedback</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Shalean Google reviews — Cape Town homeowners
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            {googleReviewsShortTrustLine()}. Below are themes we hear most often—punctual teams, clear
            quotes before arrival, and kitchens and bathrooms left inspection-ready.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="text-sm font-semibold text-slate-900">
                <span className="tabular-nums">{GOOGLE_BUSINESS_REVIEWS.rating}</span> / 5 on Google
              </span>
              <span className="text-sm text-slate-500">
                · <span className="tabular-nums">{GOOGLE_BUSINESS_REVIEWS.count}+</span> verified reviews
              </span>
            </div>
            {googleWrite ? (
              <a
                href={googleWrite}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
              >
                Read reviews on Google
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16" aria-labelledby="featured-reviews-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="featured-reviews-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            What Cape Town customers say
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            Summarised feedback from recent bookings—suburbs included for local context.
          </p>

          <div className="mt-10 lg:hidden">
            <AboutReviewsRotator reviews={ABOUT_REVIEWS} />
          </div>
          <div className="mt-10 hidden gap-6 lg:grid lg:grid-cols-3">
            {ABOUT_REVIEWS.map((r) => (
              <ReviewCard
                key={`${r.author}-${r.suburb}`}
                quote={r.quote}
                author={r.author}
                initials={r.initials}
                suburb={r.suburb}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 py-12 md:py-14">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Ready to book a trusted clean?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
            Get an instant quote online or browse our service pages for pricing and what&apos;s included.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <GrowthCtaLink
              href={bookingHref}
              source="reviews_page_cta"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Book online
            </GrowthCtaLink>
            <Link
              href="/quote"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Get a free quote
            </Link>
            <Link
              href="/services"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              View services
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
