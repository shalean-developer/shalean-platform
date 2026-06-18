"use client";

import Link from "next/link";

type PendingOffersBannerProps = {
  /** Count of pending dispatch offers visible to this cleaner (`/api/cleaner/offers`). */
  pendingOfferCount: number;
};

/**
 * When the Jobs list is empty (or short) but the cleaner has one or more pending dispatch
 * offers waiting on the dashboard (`/cleaner/dashboard` `JobOffersSection`), surface a clear
 * call-to-action so the cleaner doesn't see the bare "No jobs available right now" empty state
 * and assume there's no work for them. The Jobs list intentionally only renders bookings the
 * cleaner already has access to (assigned / roster / team / payout owner) — pending offers
 * are accept-or-decline gates and live on the dashboard surface.
 */
export function PendingOffersBanner({ pendingOfferCount }: PendingOffersBannerProps) {
  if (pendingOfferCount <= 0) return null;
  const plural = pendingOfferCount > 1;
  return (
    <Link
      href="/jobs"
      className="block rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm shadow-sm transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/20"
      aria-label={`You have ${pendingOfferCount} pending job offer${plural ? "s" : ""}. Open the dashboard to respond.`}
    >
      <p className="font-semibold text-emerald-950 dark:text-emerald-50">
        {plural ? `You have ${pendingOfferCount} new job offers` : "You have a new job offer"}
      </p>
      <p className="mt-1 text-xs text-emerald-900/85 dark:text-emerald-100/90">
        Open your dashboard to accept or decline before {plural ? "they" : "it"} expire{plural ? "" : "s"}.
      </p>
    </Link>
  );
}
