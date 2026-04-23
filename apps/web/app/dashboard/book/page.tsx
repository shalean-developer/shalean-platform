"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardBookPage() {
  const { bookings, loading } = useBookings();

  const pre = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted[0] ?? null;
  }, [bookings]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div>
      <PageHeader
        title="Book Cleaning"
        description="Start the booking flow. We can pre-fill from your most recent booking when you continue."
      />

      <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <CardContent className="space-y-6 p-6 sm:p-8">
          {pre ? (
            <div className="rounded-2xl bg-blue-50/80 p-5 dark:bg-blue-950/30">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Prefill from last booking</p>
              <ul className="mt-3 space-y-2 text-sm text-blue-900/90 dark:text-blue-100/90">
                <li>
                  <span className="font-medium">Service:</span> {pre.serviceName}
                </li>
                <li>
                  <span className="font-medium">Address:</span> {pre.addressLine}, {pre.suburb}
                </li>
                <li>
                  <span className="font-medium">Duration:</span> {pre.durationHours} hours
                </li>
                <li>
                  <span className="font-medium">Rooms:</span> {pre.rooms.join(", ")}
                </li>
                {pre.extras.length ? (
                  <li>
                    <span className="font-medium">Extras:</span> {pre.extras.join(", ")}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No past bookings yet — you can still start a new clean below.</p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="xl" className="min-h-14 flex-1 rounded-2xl">
              <Link href="/booking">
                <Sparkles className="h-5 w-5" />
                Start New Booking
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="min-h-14 flex-1 rounded-2xl">
              <Link href="/dashboard/bookings">View my bookings</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
