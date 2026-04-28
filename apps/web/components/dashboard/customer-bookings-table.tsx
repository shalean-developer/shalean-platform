"use client";

import Link from "next/link";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { customerNotesFromBooking } from "@/lib/dashboard/customerBookingDisplay";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";

export function CustomerBookingsTable({ bookings }: { bookings: DashboardBooking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-zinc-500">No bookings in this list.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3 text-right"> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {bookings.map((b) => {
            const notes = customerNotesFromBooking(b);
            return (
              <tr key={b.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {formatBookingWhen(b.date, b.time)}
                </td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{b.serviceName}</td>
                <td className="px-4 py-3">
                  <CustomerBookingStatusBadge booking={b} />
                </td>
                <td className="max-w-[220px] px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {notes ? <span className="line-clamp-2">{notes}</span> : <span className="text-zinc-400">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm" className="rounded-lg text-blue-600">
                    <Link href={`/dashboard/bookings/${b.id}`}>Details</Link>
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
