import { PublishedReviewsSection } from "./PublishedReviewsSection";
import { Suspense } from "react";
import Link from "next/link";
import { GoogleReviewPanel } from "./ReviewSourcePanels";
import { CUSTOMER_ACCOUNT_REVIEWS_PATH } from "@/lib/customer/customerAccountPaths";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { buildReviewsPageJsonLd } from "@/lib/seo/reviewsPageJsonLd";

export function ReviewsPageContent({ page = 1 }: { page?: number }) {
  const bookingHref = marketingHomeBookingHref();
  const jsonLd = buildReviewsPageJsonLd(page);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-slate-200 bg-gradient-to-b from-sky-50/80 to-white py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600"><ol className="flex flex-wrap gap-2"><li><Link href="/" className="underline underline-offset-4">Home</Link></li><li aria-hidden="true">/</li><li aria-current="page">Customer reviews</li></ol></nav>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Customer feedback</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Shalean customer reviews — Cape Town
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            Read customer feedback from completed Shalean cleaning bookings in Cape Town.
            Explore reviews shared directly with us below, or visit our separate Google Business Profile.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="#booking-reviews" className="inline-flex min-h-11 items-center rounded-xl bg-sky-800 px-5 text-sm font-semibold text-white hover:bg-sky-900">Read booking reviews</Link>
            <Link href={CUSTOMER_ACCOUNT_REVIEWS_PATH} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50">Review your Shalean booking</Link>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <PublishedReviewsSection page={page} />
      </Suspense>

      <GoogleReviewPanel />

      <section className="bg-white py-12 md:py-14">
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
