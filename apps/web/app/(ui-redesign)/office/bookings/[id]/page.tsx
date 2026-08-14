"use client";

import { useParams, useSearchParams } from "next/navigation";
import BookingDetailsView from "@/components/admin/BookingDetailsView";
import { OfficeBookingCustomerInstructionsBanner } from "@/components/admin/office/OfficeBookingCustomerInstructionsBanner";

export default function OfficeBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const initialAction = searchParams.get("action");

  return (
    <div className="space-y-5">
      <OfficeBookingCustomerInstructionsBanner bookingId={id} />
      <BookingDetailsView booking={{ id }} basePath="/office/bookings" initialAction={initialAction} />
    </div>
  );
}
