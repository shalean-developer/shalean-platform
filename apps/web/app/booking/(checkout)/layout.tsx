"use client";

import { Suspense } from "react";
import { BookingCheckoutShell } from "@/components/booking/checkout/BookingCheckoutShell";

function BookingCheckoutSkeleton() {
  return (
    <div className="min-h-[50vh] animate-pulse bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex h-[60px] items-center justify-between gap-4">
          <div className="h-6 w-28 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="hidden h-8 flex-1 max-w-md gap-2 sm:flex">
            <div className="h-8 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-9 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-6 w-1/3 max-w-xs rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="mx-auto h-40 max-w-[576px] rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="mx-auto h-32 max-w-[576px] rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

export default function BookingCheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BookingCheckoutSkeleton />}>
      <BookingCheckoutShell>{children}</BookingCheckoutShell>
    </Suspense>
  );
}
