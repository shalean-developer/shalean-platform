"use client";

import { useParams, useSearchParams } from "next/navigation";
import BookingDetailsView from "@/components/admin/BookingDetailsView";
import { OfficeBookingOperationalSummary } from "@/components/admin/office/OfficeBookingOperationalSummary";

export default function OfficeBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const initialAction = searchParams.get("action");

  return (
    <div className="space-y-5">
      <OfficeBookingOperationalSummary bookingId={id} />
      <div className="border-t border-slate-200 pt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Booking controls & full detail
        </p>
        <BookingDetailsView booking={{ id }} basePath="/office/bookings" initialAction={initialAction} />
      </div>
    </div>
  );
}
