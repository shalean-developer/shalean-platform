"use client";

import { Suspense } from "react";
import { BookingCheckoutShell } from "@/components/booking/checkout/BookingCheckoutShell";

export default function BookingCheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center bg-zinc-50 py-24 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <BookingCheckoutShell>{children}</BookingCheckoutShell>
    </Suspense>
  );
}
