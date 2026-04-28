"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useReviews } from "@/hooks/useReviews";
import { isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import { PageHeader } from "@/components/dashboard/page-header";
import { BookingCard } from "@/components/dashboard/booking-card";
import { CustomerBookingsTable } from "@/components/dashboard/customer-bookings-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardBookingsPage() {
  const { bookings, loading, error, refetch, cancelBooking, rescheduleBooking } = useBookings();
  const { reviews, loading: revLoading } = useReviews();
  const [view, setView] = useState<"cards" | "table">("cards");

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

  const past = useMemo(
    () =>
      [...bookings]
        .filter((b) => !isUpcomingBookingRow(b))
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [bookings],
  );

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="My Bookings" description="Upcoming visits and past cleans on your monthly plan." />

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

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={view === "cards" ? "default" : "outline"} className="rounded-xl" onClick={() => setView("cards")}>
          Cards
        </Button>
        <Button type="button" size="sm" variant={view === "table" ? "default" : "outline"} className="rounded-xl" onClick={() => setView("table")}>
          Table
        </Button>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming bookings"
              description="Schedule a clean from Book cleaning — it will show here with reminders and cleaner updates."
            />
          ) : view === "cards" ? (
            <ul className="space-y-4">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <BookingCard booking={b} onCancel={cancelBooking} onReschedule={rescheduleBooking} />
                </li>
              ))}
            </ul>
          ) : (
            <CustomerBookingsTable bookings={upcoming} />
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {past.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No past bookings yet"
              description="Completed and cancelled visits appear here."
            />
          ) : view === "cards" ? (
            <ul className="space-y-4">
              {past.map((b) => (
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
          ) : (
            <CustomerBookingsTable bookings={past} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
