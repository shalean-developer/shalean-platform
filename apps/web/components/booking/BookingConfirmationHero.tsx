"use client";

import Link from "next/link";
import { Calendar, Check, Copy, Mail, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export type BookingConfirmationHeroProps = {
  reference: string;
  bookingId: string;
  hasSession: boolean;
  scheduleLine: string | null;
  showSmsConfirmation: boolean;
  googleCalendarUrl: string | null;
};

function formatReferenceDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
}

function viewBookingHref(bookingId: string, hasSession: boolean): string {
  const id = bookingId.trim();
  const path = `/dashboard/bookings/${encodeURIComponent(id)}`;
  if (hasSession) return path;
  return `/auth/login?redirect=${encodeURIComponent(path)}`;
}

function ConfirmationDetailRow({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.06] text-primary dark:border-primary/35 dark:bg-primary/10"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-1.5 text-sm leading-snug text-zinc-700 dark:text-zinc-200">{children}</div>
    </div>
  );
}

export function BookingConfirmationHero({
  reference,
  bookingId,
  hasSession,
  scheduleLine,
  showSmsConfirmation,
  googleCalendarUrl,
}: BookingConfirmationHeroProps) {
  const [copied, setCopied] = useState(false);
  const displayRef = formatReferenceDisplay(reference);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    const raw = reference.trim();
    if (!raw || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }, [reference]);

  const primaryHref = viewBookingHref(bookingId, hasSession);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Mobile: compact completion rail */}
      <div className="flex items-center justify-center gap-1 px-1 md:hidden" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-700/15">
              <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
            </span>
            <span className="mx-1 h-px w-4 bg-zinc-200 dark:bg-zinc-700" />
          </div>
        ))}
        <span className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-sm ring-4 ring-primary/15">
          5
        </span>
      </div>

      {/* Desktop: step header */}
      <header className="hidden border-b border-zinc-200 pb-5 dark:border-zinc-800 md:block">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground shadow-sm ring-4 ring-primary/12">
            5
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-lg font-bold tracking-tight text-primary">Booking Confirmation</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">Your booking is confirmed.</p>
            <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">All details sent to you.</p>
          </div>
        </div>
      </header>

      <section
        className="rounded-2xl border border-zinc-200/95 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6 md:p-7"
        aria-labelledby="booking-confirmed-heading"
      >
        <div className="text-center md:px-2">
          <div className="mx-auto flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-700/20 ring-[3px] ring-emerald-500/25 dark:bg-emerald-500">
            <Check className="h-[2.1rem] w-[2.1rem] stroke-[2.75]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
          </div>
          <h1
            id="booking-confirmed-heading"
            className="mt-5 text-[1.65rem] font-bold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-[1.75rem]"
          >
            Booking confirmed!
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-[0.9375rem]">
            Your booking has been successfully confirmed.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200/90 bg-slate-50 px-4 py-3.5 dark:border-zinc-700 dark:bg-zinc-900/70">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Booking reference
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="min-w-0 break-all text-center font-mono text-base font-bold tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-lg">
              {displayRef}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label={copied ? "Copied" : "Copy booking reference"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.97] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
            >
              {copied ? (
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Copy className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
          <p
            className={`mt-1 text-center text-xs font-medium text-emerald-700 transition-opacity dark:text-emerald-400 ${
              copied ? "opacity-100" : "opacity-0"
            }`}
            aria-live="polite"
          >
            Copied
          </p>
        </div>

        <div className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
          <ConfirmationDetailRow icon={<Mail className="h-[18px] w-[18px]" aria-hidden />}>
            Confirmation email sent
          </ConfirmationDetailRow>
          {showSmsConfirmation ? (
            <ConfirmationDetailRow icon={<MessageSquare className="h-[18px] w-[18px]" aria-hidden />}>
              SMS sent to your phone
            </ConfirmationDetailRow>
          ) : null}
          <ConfirmationDetailRow icon={<Calendar className="h-[18px] w-[18px]" aria-hidden />}>
            {scheduleLine ? (
              <>
                We&apos;ll see you on{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{scheduleLine}</span>
              </>
            ) : (
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                We&apos;ll confirm your visit time in your confirmation email.
              </span>
            )}
          </ConfirmationDetailRow>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <Link
            href={primaryHref}
            className="inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:bg-primary/92 hover:shadow-lg active:scale-[0.99]"
          >
            View my booking
          </Link>
          {googleCalendarUrl ? (
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[2.85rem] w-full items-center justify-center gap-2 rounded-xl border-2 border-primary bg-transparent px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/[0.06] active:scale-[0.99] dark:hover:bg-primary/10"
            >
              <Calendar className="h-4 w-4 shrink-0" aria-hidden />
              Add to calendar
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
