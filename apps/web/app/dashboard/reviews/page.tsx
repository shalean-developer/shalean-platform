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
import { DashboardListSkeleton } from "@/components/dashboard/dashboard-skeletons";

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

  const reviewable = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === "completed" && b.raw.cleaner_id && !reviewedIds.has(b.id),
      ),
    [bookings, reviewedIds],
  );

  useEffect(() => {
    if (openedFromQuery || bookingsLoading || loading) return;
    const b = searchParams.get("booking")?.trim() ?? "";
    if (!b) return;
    if (!reviewable.some((x) => x.id === b)) return;
    setBookingId(b);
    setOpen(true);
    setOpenedFromQuery(true);
  }, [searchParams, reviewable, bookingsLoading, loading, openedFromQuery]);

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
                  {reviewable.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.serviceName} · {b.date} {b.time}
                    </option>
                  ))}
                </select>
              )}
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
