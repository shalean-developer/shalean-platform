"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import {
  displayCustomerBookingReference,
  formatCustomerBookingTotalPaid,
} from "@/lib/booking/customerBookingReference";
import { BookingSuccessReferralPrompt } from "@/components/referrals/BookingSuccessReferralPrompt";
import { CUSTOMER_SUPPORT_WHATSAPP_E164 } from "@/lib/site/customerSupport";

export type BookingConfirmationHeroProps = {
  bookingReference: string | null;
  totalPaidZar: number | null;
  bookingId: string;
  hasSession: boolean;
};

function viewBookingHref(bookingId: string, hasSession: boolean): string {
  const id = bookingId.trim();
  const path = `/account/bookings/${encodeURIComponent(id)}`;
  if (hasSession) return path;
  return `/auth/login?redirect=${encodeURIComponent(path)}`;
}

function whatsAppSupportHref(bookingReference: string | null): string {
  const refLine = bookingReference ? ` My reference is ${bookingReference}.` : "";
  const text = encodeURIComponent(`Hi, I need help with my booking.${refLine}`);
  return `https://wa.me/${CUSTOMER_SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}?text=${text}`;
}

export function BookingConfirmationHero({
  bookingReference,
  totalPaidZar,
  bookingId,
  hasSession,
}: BookingConfirmationHeroProps) {
  const displayRef = displayCustomerBookingReference({ bookingReference });
  const primaryHref = viewBookingHref(bookingId, hasSession);

  return (
    <section
      className="rounded-2xl border border-zinc-200/90 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
      aria-labelledby="booking-confirmed-heading"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-700/20 ring-4 ring-emerald-500/20">
        <Check className="h-8 w-8 stroke-[2.75]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
      </div>

      <h1
        id="booking-confirmed-heading"
        className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
      >
        Booking confirmed!
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Your booking has been confirmed. We&apos;ve sent the details to your email.
      </p>

      <dl className="mx-auto mt-8 max-w-xs space-y-5 text-left">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Booking reference
          </dt>
          <dd className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {displayRef ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total paid
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-primary">
            {totalPaidZar != null ? formatCustomerBookingTotalPaid(totalPaidZar) : "—"}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Confirmation sent to your email.</p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={primaryHref}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/92 active:scale-[0.99]"
        >
          View my booking
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          Back home
        </Link>
      </div>

      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
        Need help?{" "}
        <a
          href={whatsAppSupportHref(displayRef)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
        >
          WhatsApp us
        </a>
        .
      </p>

      <BookingSuccessReferralPrompt hasSession={hasSession} />
    </section>
  );
}
