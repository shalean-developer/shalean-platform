import type { Metadata } from "next";
import { BookingPaymentPage } from "@/components/booking/checkout/pages/BookingPaymentPage";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <BookingPaymentPage />;
}
