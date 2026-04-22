import { Suspense } from "react";
import { BookingFlowClient } from "@/components/booking/BookingFlowClient";

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <BookingFlowClient />
    </Suspense>
  );
}
