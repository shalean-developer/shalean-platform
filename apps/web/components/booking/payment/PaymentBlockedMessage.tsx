"use client";

import Link from "next/link";
import type { BookingPaymentBlockedReason } from "@/lib/booking/bookingPaymentTypes";

type Props = {
  reason: BookingPaymentBlockedReason;
};

export function PaymentBlockedMessage({ reason }: Props) {
  if (reason.kind === "admin_unavailable") {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Payments are temporarily unavailable.</p>
        <Link href="/account/bookings" className="mt-4 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }

  if (reason.kind === "not_found") {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Booking not found</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Check the link or open your bookings dashboard.</p>
        <Link href="/account/bookings" className="mt-6 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }

  if (reason.kind === "wrong_status") {
    const { paid, bookingId } = reason;
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{paid ? "Already paid" : "Cannot pay online"}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {paid ? "This booking is already confirmed." : "This booking is not awaiting payment."}
        </p>
        <Link
          href={paid ? `/account/bookings/${bookingId}` : "/account/bookings"}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-medium text-white"
        >
          {paid ? "View booking" : "Go to dashboard"}
        </Link>
      </div>
    );
  }

  if (reason.kind === "missing_email") {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Cannot pay online</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This booking is missing a customer email.</p>
        <Link href="/account/bookings" className="mt-6 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Amount not set</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This booking does not have a payable total yet.</p>
      <Link href="/account/bookings" className="mt-6 inline-block text-sm font-medium text-blue-600 underline">
        Dashboard
      </Link>
    </div>
  );
}
