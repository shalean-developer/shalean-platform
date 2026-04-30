import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlowClient } from "@/components/booking/BookingFlowClient";

type BookingPageSearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams: Promise<BookingPageSearchParams>;
};

export const metadata: Metadata = {
  title: "Book Cleaning Services in Cape Town | Shalean",
  description: "Get instant pricing and book trusted cleaners in minutes. Choose your service, address, and time online.",
};

export default async function BookingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Book cleaning services in Cape Town
          </h1>
          <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
            Get instant pricing and book trusted cleaners in minutes.
          </p>
        </div>
      </header>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            Loading…
          </div>
        }
      >
        <BookingFlowClient initialSearchParams={sp} />
      </Suspense>
    </div>
  );
}
