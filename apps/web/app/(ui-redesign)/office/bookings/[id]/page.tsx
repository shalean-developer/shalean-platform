"use client";

import { useParams, useSearchParams } from "next/navigation";
import BookingDetailsView from "@/components/admin/BookingDetailsView";

export default function OfficeBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const initialAction = searchParams.get("action");

  return (
    <BookingDetailsView booking={{ id }} basePath="/office/bookings" initialAction={initialAction} />
  );
}
