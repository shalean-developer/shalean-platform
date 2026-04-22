import Link from "next/link";
import BookingContainer from "@/components/layout/BookingContainer";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ booking?: string }> };

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const bookingId = typeof sp.booking === "string" ? sp.booking.trim() : "";
  const base = getPublicAppUrlBase();

  return (
    <BookingContainer className="py-12 sm:py-16">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Thank you</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          We appreciate you taking a moment to leave feedback about your Shalean clean
          {bookingId ? (
            <>
              {" "}
              <span className="font-mono text-xs text-zinc-500">({bookingId.slice(0, 8)}…)</span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`${base}/account/bookings`}
            className="inline-flex justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Your bookings
          </Link>
          <Link
            href={`${base}/booking?step=details`}
            className="inline-flex justify-center rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
          >
            Book again
          </Link>
        </div>
      </div>
    </BookingContainer>
  );
}
