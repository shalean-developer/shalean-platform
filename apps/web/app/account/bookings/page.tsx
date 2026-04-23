import { redirect } from "next/navigation";

/**
 * Legacy customer bookings URL — new UI lives under `/dashboard`.
 */
export default function AccountBookingsRedirectPage() {
  redirect("/dashboard/bookings");
}
