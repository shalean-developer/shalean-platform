"use client";

import { useParams, useSearchParams } from "next/navigation";
import BookingDetailsView from "@/components/admin/BookingDetailsView";
import { OfficeBookingOperationalDashboard } from "@/components/admin/office/OfficeBookingOperationalDashboard";

export default function OfficeBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const initialAction = searchParams.get("action");

  return (
    <div className="space-y-5">
      <OfficeBookingOperationalDashboard bookingId={id} />

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm" open={Boolean(initialAction)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <p className="font-semibold text-slate-900">Booking actions & detailed record</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Open when you need to edit, reassign, reschedule, review lifecycle history, notifications, Zoho or advanced booking fields.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 group-open:bg-blue-50 group-open:text-blue-700">
            <span className="group-open:hidden">Open details</span>
            <span className="hidden group-open:inline">Hide details</span>
          </span>
        </summary>
        <div className="border-t border-slate-200 px-3 py-4 sm:px-5">
          <BookingDetailsView booking={{ id }} basePath="/office/bookings" initialAction={initialAction} />
        </div>
      </details>
    </div>
  );
}
