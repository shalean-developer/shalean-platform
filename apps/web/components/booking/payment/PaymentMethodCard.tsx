"use client";

import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { PaymentMethodDisplay } from "@/components/booking/checkout/PaymentMethodDisplay";

export function PaymentMethodCard({ footerTrust = true }: { footerTrust?: boolean }) {
  return (
    <BookingSectionCard className="p-4 sm:p-5">
      <PaymentMethodDisplay footerTrust={footerTrust} />
    </BookingSectionCard>
  );
}
