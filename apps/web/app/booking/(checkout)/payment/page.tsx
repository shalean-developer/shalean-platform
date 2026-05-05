import type { Metadata } from "next";
import { BookingPaymentPage } from "@/components/booking/checkout/pages/BookingPaymentPage";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexNoFollowCanonical("/booking/payment");

export default function Page() {
  return <BookingPaymentPage />;
}
