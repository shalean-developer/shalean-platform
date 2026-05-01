import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Payment successful | Shalean",
};

type PageProps = {
  searchParams: Promise<{ bookingId?: string | string[] }>;
};

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = sp.bookingId;
  const bookingId = Array.isArray(raw) ? raw[0] : raw;
  const safeId = bookingId && /^[0-9a-f-]{36}$/i.test(bookingId) ? bookingId : null;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Payment successful</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Booking confirmed</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Your payment was verified. We&apos;ll follow up with booking details by email.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Go to dashboard
          </Link>
          {safeId ? (
            <Link
              href={`/dashboard/bookings/${safeId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              View booking
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
