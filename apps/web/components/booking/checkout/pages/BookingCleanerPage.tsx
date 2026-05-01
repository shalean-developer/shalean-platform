"use client";

import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { CleanerStep } from "@/components/booking/steps/CleanerStep";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";

export function BookingCleanerPage() {
  const cleanerId = useBookingCheckoutStore((s) => s.cleanerId);
  const patch = useBookingCheckoutStore((s) => s.patch);

  return (
    <BookingSectionCard eyebrow="Cleaner">
      <CleanerStep cleanerId={cleanerId} onChange={(id) => patch({ cleanerId: id })} />
    </BookingSectionCard>
  );
}
