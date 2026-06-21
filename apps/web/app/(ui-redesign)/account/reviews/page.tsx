"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { MessageSquare, Star, ThumbsUp } from "lucide-react";
import { useReviews } from "@/hooks/useReviews";
import { useBookings } from "@/hooks/useBookings";
import { HelpCard } from "@/components/account/HelpCard";
import { Button } from "@/components/ui/button";
import { isBookingPendingCustomerReview } from "@/lib/dashboard/customerBookingReviewUi";
import { cn } from "@/lib/utils";

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("h-4 w-4", s <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200")}
        />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className="focus:outline-none"
          aria-label={`${s} star${s !== 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              s <= value ? "fill-amber-400 text-amber-400" : "text-gray-200 hover:text-amber-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewsContent() {
  const { reviews, loading: revLoading, error: revError } = useReviews();
  const { bookings, loading: bookLoading } = useBookings();

  const reviewedIds = useMemo(() => new Set(reviews.map((r) => r.booking_id)), [reviews]);

  const pendingReviews = useMemo(() => {
    if (bookLoading || revLoading) return [];
    return bookings.filter((b) => isBookingPendingCustomerReview(b, reviewedIds));
  }, [bookings, reviewedIds, bookLoading, revLoading]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  if (revLoading || bookLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100" />
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reviews</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your feedback helps us improve and reward our best cleaners.
          </p>
        </div>
        {reviews.length > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2.5">
            <StarDisplay rating={Math.round(avgRating)} />
            <div>
              <p className="text-sm font-bold text-amber-900">{avgRating.toFixed(1)}</p>
              <p className="text-xs text-amber-700">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        ) : null}
      </div>

      {revError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load reviews: {revError}
        </div>
      ) : null}

      {/* Pending reviews */}
      {pendingReviews.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {pendingReviews.length}
            </div>
            <h2 className="text-base font-semibold text-gray-900">Awaiting your review</h2>
          </div>
          <ul className="space-y-3">
            {pendingReviews.map((b) => (
              <li key={b.id}>
                <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                        <Star className="h-5 w-5 text-amber-600" strokeWidth={1.75} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{b.serviceName}</p>
                        <p className="mt-0.5 text-sm text-gray-500">{b.date} · {b.time}</p>
                        <p className="text-sm text-gray-500">{b.addressLine}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <StarPicker value={0} onChange={() => { /* navigates to review page */ }} />
                      <Button
                        asChild
                        size="sm"
                        className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                      >
                        <Link href={`/review?booking=${encodeURIComponent(b.id)}`}>
                          Leave review
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Submitted reviews */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Submitted reviews</h2>
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
              <MessageSquare className="h-8 w-8 text-amber-400" strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-gray-900">No reviews yet</h2>
            <p className="mt-2 max-w-xs text-sm text-gray-500">
              Complete a booking and leave your first review. Your feedback means a lot to our cleaners.
            </p>
            <Button asChild size="lg" className="mt-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
              <Link href="/account/bookings">View my bookings</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id}>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50">
                        <ThumbsUp className="h-5 w-5 text-green-600" strokeWidth={1.75} />
                      </div>
                      <div>
                        <StarDisplay rating={r.rating} />
                        {r.comment ? (
                          <p className="mt-2 text-sm text-gray-700 leading-relaxed max-w-lg">{r.comment}</p>
                        ) : (
                          <p className="mt-2 text-sm italic text-gray-400">No comment added.</p>
                        )}
                      </div>
                    </div>
                    <p className="shrink-0 text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Why reviews matter */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <Star className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold text-blue-900">Your reviews make a difference</p>
            <p className="mt-1 text-sm text-blue-700">
              Honest feedback helps us match you with the best cleaner and rewards our top performers with more work.
            </p>
          </div>
        </div>
      </div>

      <HelpCard />
    </div>
  );
}

export default function AccountReviewsPage() {
  return (
    <Suspense fallback={<div className="space-y-4 animate-pulse"><div className="h-8 w-48 rounded-xl bg-gray-100" />{[1,2,3].map(i=><div key={i} className="h-28 rounded-2xl bg-gray-100"/>)}</div>}>
      <ReviewsContent />
    </Suspense>
  );
}
