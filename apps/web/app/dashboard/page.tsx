"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Calendar, MapPin, Sparkles, Repeat } from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { useAddresses } from "@/hooks/useAddresses";
import { isUpcomingBookingRow, formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { PageHeader } from "@/components/dashboard/page-header";
import { BookingCard } from "@/components/dashboard/booking-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardHomePage() {
  const { bookings, loading, error, refetch } = useBookings();
  const { addresses, loading: addrLoading } = useAddresses();

  const upcoming = useMemo(
    () =>
      [...bookings]
        .filter(isUpcomingBookingRow)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [bookings],
  );
  const nextBooking = upcoming[0];

  const recent = useMemo(
    () =>
      [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3),
    [bookings],
  );

  const defaultAddr = useMemo(() => addresses.find((a) => a.is_default) ?? addresses[0], [addresses]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Your home for bookings, updates, and quick actions." />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Upcoming cleaning</h2>
          {nextBooking ? (
            <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{nextBooking.serviceName}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      {formatBookingWhen(nextBooking.date, nextBooking.time)}
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      {nextBooking.addressLine}, {nextBooking.suburb}
                    </p>
                    {nextBooking.cleaner ? (
                      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                        Cleaner: <span className="font-medium">{nextBooking.cleaner.name}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">We&apos;ll assign a cleaner soon.</p>
                    )}
                  </div>
                  <StatusBadge status={nextBooking.status} />
                </div>
                <Separator className="my-5" />
                <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
                  <Link href={`/dashboard/bookings/${nextBooking.id}`}>View Details</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-600 dark:bg-zinc-900">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">No upcoming cleans</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Book your next visit in a few taps.</p>
              <Button asChild size="lg" className="mt-4 rounded-xl">
                <Link href="/dashboard/book">Book Cleaning</Link>
              </Button>
            </Card>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Quick actions</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="w-full rounded-2xl sm:flex-1">
                <Link href="/dashboard/book">
                  <Sparkles className="h-5 w-5" />
                  Book Cleaning
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="w-full rounded-2xl sm:flex-1">
                <Link href="/dashboard/bookings">
                  <Repeat className="h-5 w-5" />
                  Book Again
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Saved address</h2>
            <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <CardContent className="p-5">
                {addrLoading ? (
                  <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                ) : defaultAddr ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{defaultAddr.label}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{defaultAddr.line1}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {defaultAddr.suburb}, {defaultAddr.city} {defaultAddr.postal_code}
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                      <Link href="/dashboard/addresses">Manage</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">No saved addresses yet.</p>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-xl">
                      <Link href="/dashboard/addresses">Add address</Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent bookings</h2>
          <Link href="/dashboard/bookings" className="text-sm font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No bookings yet.</p>
        ) : (
          <ul className="space-y-4">
            {recent.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} showActions={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
