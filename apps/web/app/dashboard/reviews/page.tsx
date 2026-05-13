"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { useReviews } from "@/hooks/useReviews";
import { useBookings } from "@/hooks/useBookings";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { isDashboardBookingAuthoritativelyCompleted } from "@/lib/dashboard/dashboardBookingOperational";
import { DashboardListSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { bookingIsReviewSubmissionEligibleAssignee } from "@/lib/reviews/customerReviewFollowUpContract";
import { chooseReviewModalAutoOpenIntent } from "@/lib/reviews/reviewModalAutoOpenIntent";

function StarsRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="rounded-lg p-1 transition hover:bg-amber-50 dark:hover:bg-amber-950/30"
          aria-label={`${n} stars`}
        >
          <Star className={n <= value ? "h-8 w-8 fill-amber-400 text-amber-500" : "h-8 w-8 text-zinc-300 dark:text-zinc-600"} />
        </button>
      ))}
    </div>
  );
}

function DashboardReviewsInner() {
  const searchParams = useSearchParams();
  const toast = useDashboardToast();
  const { reviews, loading, error, refetch, submitReview } = useReviews();
  const { bookings, loading: bookingsLoading } = useBookings();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState<string>("");
  const [openedFromQuery, setOpenedFromQuery] = useState(false);

  const reviewedIds = useMemo(() => new Set(reviews.map((r) => r.booking_id)), [reviews]);

  /*
   * H-8: team-assigned completed bookings clear `cleaner_id` and carry
   * the lead cleaner in `payout_owner_cleaner_id`. The shared
   * `bookingIsReviewSubmissionEligibleAssignee` helper keeps this
   * client-side filter in lockstep with the server's
   * `evaluateCustomerReviewSubmissionEligibility` so the dropdown never
   * shows a booking the API would reject (and never hides one it would
   * accept).
   */
  const reviewable = useMemo(
    () =>
      bookings.filter(
        (b) =>
          isDashboardBookingAuthoritativelyCompleted(b) &&
          bookingIsReviewSubmissionEligibleAssignee(b.raw as unknown as Record<string, unknown>) &&
          !reviewedIds.has(b.id),
      ),
    [bookings, reviewedIds],
  );

  /*
   * M-11: auto-open the modal when there is a deep-link `?booking=<id>`
   * (preserves existing lifecycle-email behaviour) **OR** when there is
   * exactly one reviewable booking (the common single-pending-review
   * case). Multiple reviewable bookings deliberately do NOT auto-open —
   * the dropdown stays the explicit choice so we never funnel feedback to
   * the wrong booking. Decision factored into the pure
   * {@link chooseReviewModalAutoOpenIntent} helper so the three rules
   * are exhaustively unit-testable without a React harness.
   */
  useEffect(() => {
    const intent = chooseReviewModalAutoOpenIntent({
      queryBookingId: searchParams.get("booking"),
      reviewableIds: reviewable.map((x) => x.id),
      alreadyOpened: openedFromQuery,
      bookingsLoading,
      reviewsLoading: loading,
    });
    if (intent.kind === "none") return;
    setBookingId(intent.bookingId);
    setOpen(true);
    setOpenedFromQuery(true);
  }, [searchParams, reviewable, bookingsLoading, loading, openedFromQuery]);

  /*
   * M-15: surface the cleaner being reviewed inside the modal. For solo
   * bookings this comes from the canonical `cleaners(full_name)` embed;
   * for H-8 team-assigned bookings the server enricher resolves the lead
   * name into `payout_owner_cleaner_name` (see
   * `cleanerFromRow` + `applyTeamLeadCleanerNamesToRows`). Either way
   * the displayed name is exactly the cleaner the API will write into
   * `reviews.cleaner_id`.
   */
  const selectedCleanerName = useMemo(() => {
    if (!bookingId) return null;
    const b = reviewable.find((x) => x.id === bookingId);
    return b?.cleaner?.name?.trim() || null;
  }, [bookingId, reviewable]);

  async function onSubmit() {
    if (!bookingId) {
      toast("Choose a completed booking to review.", "error");
      return;
    }
    setBusy(true);
    const r = await submitReview(bookingId, rating, comment);
    setBusy(false);
    if (!r.ok) {
      toast(r.message, "error");
      return;
    }
    toast("Thanks — your review was saved.", "success");
    setOpen(false);
    setComment("");
    setRating(5);
    setBookingId("");
    await refetch();
  }

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Feedback you have left after completed cleans."
        action={
          <Button
            type="button"
            size="lg"
            className="rounded-xl"
            onClick={() => {
              setBookingId(reviewable[0]?.id ?? "");
              setOpen(true);
            }}
            disabled={reviewable.length === 0 && !bookingsLoading}
          >
            Leave Review
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <DashboardListSkeleton rows={3} />
      ) : reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">You have not submitted any reviews yet.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{r.serviceName}</p>
                    <p className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString("en-ZA")}</p>
                  </div>
                  {/* M-15: show the cleaner the rating was saved against so
                   * customers can recognise / cross-reference past reviews.
                   * For team jobs this is the lead cleaner the H-8 resolver
                   * wrote into `reviews.cleaner_id` — same value the modal
                   * showed at submission time. Skipped silently when the
                   * cleaner row is missing (legacy data) so the card layout
                   * doesn't shift. */}
                  {r.cleanerName ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Reviewed{" "}
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.cleanerName}</span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={i < r.rating ? "h-4 w-4 fill-amber-400 text-amber-500" : "h-4 w-4 text-zinc-300 dark:text-zinc-600"}
                      />
                    ))}
                  </div>
                  {r.comment ? <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{r.comment}</p> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Leave a review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rev-booking">Completed booking</Label>
              {reviewable.length === 0 ? (
                <p className="text-sm text-zinc-500">No completed cleans with an assigned cleaner are waiting for a review.</p>
              ) : (
                <select
                  id="rev-booking"
                  className="flex h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                >
                  {reviewable.map((b) => {
                    /* M-15: append cleaner name to each option so customers
                     * never review the wrong clean by accident, especially
                     * when multiple completed bookings share a date/service. */
                    const cleanerSuffix = b.cleaner?.name?.trim()
                      ? ` · with ${b.cleaner.name.trim()}`
                      : "";
                    return (
                      <option key={b.id} value={b.id}>
                        {b.serviceName} · {b.date} {b.time}
                        {cleanerSuffix}
                      </option>
                    );
                  })}
                </select>
              )}
              {/* M-15: explicit "you're reviewing" subtitle so the cleaner
               * name is always visible above the rating widget — not just
               * inside the dropdown which collapses once chosen. */}
              {selectedCleanerName ? (
                <p className="text-xs text-zinc-500" data-testid="rev-selected-cleaner">
                  You&apos;re reviewing <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedCleanerName}</span>
                </p>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Rating</p>
              <StarsRow value={rating} onChange={setRating} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Comment</p>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us how the clean went…" rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void onSubmit()} disabled={busy || reviewable.length === 0}>
              {busy ? "Saving…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DashboardReviewsPage() {
  return (
    <Suspense fallback={<DashboardListSkeleton rows={3} />}>
      <DashboardReviewsInner />
    </Suspense>
  );
}
