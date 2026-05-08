import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isBookingPaymentUuid } from "@/lib/booking/bookingPaymentUuid";

type PageProps = {
  params: Promise<{ bookingId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bookingId } = await params;
  return {
    title: `Pay for booking · ${bookingId.slice(0, 8)}…`,
    robots: { index: false, follow: false },
  };
}

/**
 * Legacy deep link compatibility: emails and ops still use `/payment/[bookingId]`.
 * Canonical pay UI lives at `/booking/payment?bookingId=…` (`mode=existing` for reopen/reminder links).
 */
export default async function PaymentBookingPage({ params }: PageProps) {
  const { bookingId } = await params;
  if (!isBookingPaymentUuid(bookingId)) notFound();
  redirect(`/booking/payment?bookingId=${encodeURIComponent(bookingId)}&mode=existing`);
}
