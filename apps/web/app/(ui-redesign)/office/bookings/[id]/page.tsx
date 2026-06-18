"use client";

import { useParams } from "next/navigation";
import BookingDetailsView from "@/components/admin/BookingDetailsView";

export default function OfficeBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  return <BookingDetailsView booking={{ id }} basePath="/office/bookings" />;
}
