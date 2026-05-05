import type { Metadata } from "next";
import { BookingSchedulePage } from "@/components/booking/checkout/pages/BookingSchedulePage";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking/schedule");

export default function Page() {
  return <BookingSchedulePage />;
}
