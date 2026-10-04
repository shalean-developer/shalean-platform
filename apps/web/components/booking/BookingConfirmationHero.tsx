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
  grossAmountZar?: number | null;
  cleaningCreditZar?: number | null;
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

function formatConfirmationPaidAmount(totalPaidZar: number | null): string {
  if (totalPaidZar === 0) return "R0.00";
  if (totalPaidZar == null) return "—";
  return formatCustomerBookingTotalPaid(totalPaidZar);
}

export function BookingConfirmationHero({
  bookingReference,
  totalPaidZar,
  grossAmountZar,
  cleaningCreditZar,
  bookingId,
  hasSession,
}: BookingConfirmationHeroProps) {
  const displayRef = displayCustomerBookingReference({ bookingReference });
  const primaryHref = viewBookingHref(bookingId, hasSession);

  return (
    <section
      className="rounded-2xl border border-zinc-200/90 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6"
      aria-labelledby="booking-confirmed-heading"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-700/20 ring-4 ring-emerald-500/20">
        <Check className="h-6 w-6 stroke-[2.75]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
      </div>

      <h1
        id="booking-confirmed-heading"
        className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
      >
        Booking confirmed!
      </h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        Your booking details have been emailed to you.
      </p>

      <dl className="mt-5 grid grid-cols-2 rounded-xl bg-zinc-50 p-4 text-left dark:bg-zinc-900/70">
        <div className="min-w-0 border-r border-zinc-200 pr-4 dark:border-zinc-700">
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Booking reference
          </dt>
          <dd className="mt-1 truncate text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {displayRef ?? "—"}
          </dd>
        </div>
        <div className="pl-4">
          {grossAmountZar != null && cleaningCreditZar != null && cleaningCreditZar > 0 ? (
            <>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Booking total
              </dt>
              <dd className="mt-1 text-base font-bold tabular-nums text-primary">
                {formatCustomerBookingTotalPaid(grossAmountZar)}
              </dd>
              <div className="mt-2 space-y-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                <p>Cleaning Credit −{formatCustomerBookingTotalPaid(cleaningCreditZar)}</p>
                <p>Paid by Paystack {formatConfirmationPaidAmount(totalPaidZar)}</p>
              </div>
            </>
          ) : (
            <>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Total paid
              </dt>
              <dd className="mt-1 text-base font-bold tabular-nums text-primary">
                {formatConfirmationPaidAmount(totalPaidZar)}
              </dd>
            </>
          )}
        </div>
      </dl>

      <Link
        href={primaryHref}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/92 active:scale-[0.99]"
      >
        View my booking
      </Link>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <Link
          href="/"
          className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Back home
        </Link>
        <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
          ·
        </span>
        <a
          href={whatsAppSupportHref(displayRef)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
        >
          WhatsApp support
        </a>
      </div>

      <BookingSuccessReferralPrompt hasSession={hasSession} />
    </section>
  );
}
