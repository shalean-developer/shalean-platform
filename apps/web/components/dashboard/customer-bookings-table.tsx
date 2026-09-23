"use client";

import Link from "next/link";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { customerNotesFromBooking } from "@/lib/dashboard/customerBookingDisplay";
import { canCustomerModifyDashboardBooking } from "@/lib/dashboard/dashboardBookingOperational";
import { leaveReviewHrefForBooking } from "@/lib/dashboard/customerBookingReviewUi";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";

export type CustomerBookingsTableProps = {
  bookings: DashboardBooking[];
  detailHref?: (bookingId: string) => string;
  reviewedIds?: ReadonlySet<string>;
  revLoading?: boolean;
};

export function CustomerBookingsTable({
  bookings,
  detailHref = (id) => `/account/bookings/${id}`,
  reviewedIds = new Set(),
  revLoading = false,
}: CustomerBookingsTableProps) {
  if (bookings.length === 0) {
    return <p className="text-sm text-muted-foreground">No bookings in this list.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bookings.map((b) => {
            const notes = customerNotesFromBooking(b);
            const modifiable = canCustomerModifyDashboardBooking(b);
            const reviewHref = leaveReviewHrefForBooking(b, reviewedIds, revLoading);
            const detailsHref = detailHref(b.id);

            return (
              <tr key={b.id} className="align-top transition-colors hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                  {formatBookingWhen(b.date, b.time)}
                </td>
                <td className="px-4 py-3 text-foreground">{b.serviceName}</td>
                <td className="px-4 py-3">
                  <CustomerBookingStatusBadge booking={b} />
                </td>
                <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
                  {notes ? <span className="line-clamp-2">{notes}</span> : <span aria-label="No notes">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm" className="rounded-lg text-primary">
                      <Link href={detailsHref}>Details</Link>
                    </Button>
                    {modifiable ? (
                      <>
                        <Button asChild variant="ghost" size="sm" className="rounded-lg text-primary">
                          <Link href={`${detailsHref}?action=reschedule`}>Reschedule</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="rounded-lg text-destructive hover:text-destructive">
                          <Link href={`${detailsHref}?action=cancel`}>Cancel</Link>
                        </Button>
                      </>
                    ) : null}
                    {reviewHref ? (
                      <Button asChild variant="ghost" size="sm" className="rounded-lg">
                        <Link href={reviewHref}>Review</Link>
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
