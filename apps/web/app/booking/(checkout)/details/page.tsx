import type { Metadata } from "next";
import { BookingDetailsPage } from "@/components/booking/checkout/pages/BookingDetailsPage";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking/details");

export default function Page() {
  return <BookingDetailsPage />;
}
