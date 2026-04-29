import { Suspense } from "react";
import { BookingFlowClient } from "@/components/booking/BookingFlowClient";

type BookingPageSearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams: Promise<BookingPageSearchParams>;
};

export default async function BookingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <BookingFlowClient initialSearchParams={sp} />
    </Suspense>
  );
}
