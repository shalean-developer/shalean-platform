import type { Metadata } from "next";
import { BookingCleanerPage } from "@/components/booking/checkout/pages/BookingCleanerPage";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking/cleaner");

export default function Page() {
  return <BookingCleanerPage />;
}
