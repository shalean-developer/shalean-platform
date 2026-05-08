"use client";

import { bookingCopy } from "@/lib/booking/copy";

const payCopy = bookingCopy.checkoutPayment;

export function SecureCheckoutTrust() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-400/90">
      {payCopy.secureBelowCta}
    </p>
  );
}
