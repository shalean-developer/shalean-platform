"use client";

import Link from "next/link";

type Props = {
  bookingId: string | null | undefined;
};

/**
 * Post-checkout tipping — tips are not collected at checkout; soft prompt after confirmation.
 */
export function PostBookingTipPrompt({ bookingId }: Props) {
  const id = bookingId?.trim();
  if (!id) return null;

  return (
    <section
      className="rounded-2xl border border-emerald-100/90 bg-emerald-50/35 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/25 sm:p-5"
      aria-labelledby="post-tip-heading"
    >
      <h2 id="post-tip-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Would you like to thank your cleaner with a tip?
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        Tipping isn&apos;t part of online checkout. After your visit, open your booking or reach us on WhatsApp if you&apos;d
        like to arrange a tip for your team.
      </p>
      <Link
        href={`/account/bookings/${id}`}
        className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
      >
        View booking
      </Link>
    </section>
  );
}
