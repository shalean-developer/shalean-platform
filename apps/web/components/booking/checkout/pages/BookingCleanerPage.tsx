"use client";

import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { CleanerStep } from "@/components/booking/steps/CleanerStep";
import { CustomerDetailsStep } from "@/components/booking/steps/CustomerDetailsStep";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";

const payCopy = bookingCopy.checkoutPayment;

export function BookingCleanerPage() {
  const cleanerId = useBookingCheckoutStore((s) => s.cleanerId);
  const customerName = useBookingCheckoutStore((s) => s.customerName);
  const customerEmail = useBookingCheckoutStore((s) => s.customerEmail);
  const customerPhone = useBookingCheckoutStore((s) => s.customerPhone);
  const patch = useBookingCheckoutStore((s) => s.patch);

  return (
    <div className="space-y-4 lg:space-y-6">
      <BookingSectionCard className="shadow-md shadow-zinc-900/[0.05] dark:shadow-black/25">
        <CleanerStep cleanerId={cleanerId} onChange={(id) => patch({ cleanerId: id })} />
      </BookingSectionCard>

      <BookingSectionCard eyebrow={payCopy.contactEyebrow} className="p-4 sm:p-5">
        <CustomerDetailsStep
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          onChange={(p) => patch(p)}
        />
      </BookingSectionCard>
    </div>
  );
}
