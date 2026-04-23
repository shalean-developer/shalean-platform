"use client";

import { useMemo } from "react";
import { useBookings } from "@/hooks/useBookings";
import { isUpcomingBookingRow } from "@/lib/dashboard/bookingUtils";
import { PageHeader } from "@/components/dashboard/page-header";
import { BookingCard } from "@/components/dashboard/booking-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays } from "lucide-react";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardBookingsPage() {
  const { bookings, loading, error, refetch, cancelBooking, rescheduleBooking } = useBookings();

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
                  <BookingCard booking={b} onCancel={cancelBooking} onReschedule={rescheduleBooking} />
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
