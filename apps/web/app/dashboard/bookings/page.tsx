"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useReviews } from "@/hooks/useReviews";
import { isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import { PageHeader } from "@/components/dashboard/page-header";
import { BookingCard } from "@/components/dashboard/booking-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardBookingsPage() {
  const { bookings, loading, error, refetch, cancelBooking, rescheduleBooking } = useBookings();
  const { reviews, loading: revLoading } = useReviews();

  const reviewedIds = useMemo(() => new Set(reviews.map((r) => r.booking_id)), [reviews]);

  const firstPendingReviewBookingId = useMemo(() => {
    if (revLoading) return null;
    const row = bookings.find((b) => b.status === "completed" && b.raw.cleaner_id && !reviewedIds.has(b.id));
    return row?.id ?? null;
  }, [bookings, reviewedIds, revLoading]);

  const pendingReviewCount = useMemo(() => {
    if (revLoading) return 0;
    return bookings.filter((b) => b.status === "completed" && b.raw.cleaner_id && !reviewedIds.has(b.id)).length;
  }, [bookings, reviewedIds, revLoading]);

  const leaveReviewHrefFor = (b: (typeof bookings)[0]) => {
    if (revLoading) return null;
    if (b.status !== "completed" || !b.raw.cleaner_id || reviewedIds.has(b.id)) return null;
    return `/review?booking=${encodeURIComponent(b.id)}`;
  };

  const upcoming = useMemo(
    () =>
      [...bookings]
        .filter(isUpcomingBookingRow)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [bookings],
  );
  const completed = useMemo(() => bookings.filter((b) => b.status === "completed"), [bookings]);
  const cancelled = useMemo(() => bookings.filter((b) => b.status === "cancelled" || b.status === "failed"), [bookings]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="My Bookings" description="Track, reschedule, or rebook your cleans." />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {pendingReviewCount > 0 && firstPendingReviewBookingId ? (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30">
          <div>
            <p className="font-semibold text-amber-950 dark:text-amber-100">Rate your cleaning experience</p>
            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              {pendingReviewCount === 1
                ? "You have one completed visit waiting for quick feedback."
                : `You have ${pendingReviewCount} completed visits waiting for quick feedback.`}{" "}
              It takes under a minute and helps your cleaner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button asChild className="rounded-xl bg-amber-600 text-white hover:bg-amber-700">
              <Link href={`/review?booking=${encodeURIComponent(firstPendingReviewBookingId)}`}>Leave a review</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-amber-300 bg-white/80 dark:bg-zinc-900">
              <Link href="/dashboard/reviews">All reviews</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming bookings"
              description="Schedule a clean and it will appear here with reminders and cleaner updates."
            />
          ) : (
            <ul className="space-y-4">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <BookingCard booking={b} onCancel={cancelBooking} onReschedule={rescheduleBooking} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completed.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No completed cleans yet"
              description="After your first visit, you'll see history and can leave a review."
            />
          ) : (
            <ul className="space-y-4">
              {completed.map((b) => (
                <li key={b.id}>
                  <BookingCard
                    booking={b}
                    leaveReviewHref={leaveReviewHrefFor(b)}
                    onCancel={cancelBooking}
                    onReschedule={rescheduleBooking}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="cancelled">
          {cancelled.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No cancelled bookings"
              description="Cancelled visits show here for your records."
            />
          ) : (
            <ul className="space-y-4">
              {cancelled.map((b) => (
                <li key={b.id}>
                  <BookingCard booking={b} onCancel={cancelBooking} onReschedule={rescheduleBooking} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
