"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Home,
  PanelsTopLeft,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingStep1, type PropertyTypeKind } from "@/components/booking/useBookingStep1";
import { cn } from "@/lib/utils";

function useDebouncedCommit(
  draft: string,
  commit: (v: string) => void,
  delayMs: number,
  skipWhenEquals: string,
) {
  useEffect(() => {
    if (draft === skipWhenEquals) return;
    const t = window.setTimeout(() => {
      commit(draft);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [draft, commit, delayMs, skipWhenEquals]);
}

const PROPERTY_OPTIONS: { id: PropertyTypeKind; label: string; Icon: LucideIcon }[] = [
  { id: "apartment", label: "Apartment", Icon: Building2 },
  { id: "house", label: "House", Icon: Home },
  { id: "studio", label: "Studio", Icon: PanelsTopLeft },
  { id: "office", label: "Office", Icon: Briefcase },
];

const SIDEBAR_BENEFITS: { title: string; line: string; Icon: LucideIcon }[] = [
  { title: "Trusted & verified", line: "Background-checked cleaners", Icon: ShieldCheck },
  { title: "Fast booking", line: "Takes under 60 seconds", Icon: Zap },
  { title: "Flexible scheduling", line: "Book anytime, any day", Icon: CalendarDays },
  { title: "Satisfaction guarantee", line: "We'll make it right", Icon: BadgeCheck },
];

export function StepEntry() {
  const router = useRouter();
  const booking = useBookingStep1();
  const { state, setState } = booking;
  const copy = bookingCopy.entry;
  const heading = "Book professional home cleaning in Cape Town";
  const subheading = "Tell us where you are and the home type. We will tailor your options in the next step.";

  const [locDraft, setLocDraft] = useState(state.location);
  const [addressBlurred, setAddressBlurred] = useState(false);
  /** Avoid SSR vs first-client mismatch on `booking.hydrated` before effects run. */
  const [entryContinueGate, setEntryContinueGate] = useState(false);

  useEffect(() => {
    setEntryContinueGate(true);
  }, []);

  useEffect(() => {
    setLocDraft(state.location);
  }, [state.location]);

  const commitLocation = useCallback(
    (v: string) => {
      setState((p) => ({ ...p, location: v.slice(0, 500) }));
    },
    [setState],
  );

  useDebouncedCommit(locDraft, commitLocation, 320, state.location);

  const setPropertyType = useCallback(
    (propertyType: PropertyTypeKind) => {
      setState((p) => ({ ...p, propertyType }));
    },
    [setState],
  );

  const canContinue =
    locDraft.trim().length >= 3 &&
    state.propertyType !== null &&
    (!entryContinueGate || booking.hydrated);

  const goQuote = useCallback(() => {
    if (!canContinue) return;
    commitLocation(locDraft);
    setState((p) => ({
      ...p,
      location: locDraft.trim().slice(0, 500),
      selectedCategory: "regular",
      service_group: "regular",
      service_type: "standard_cleaning",
      service: p.service ?? "standard",
    }));
    router.push(bookingFlowHref("quote"));
  }, [canContinue, commitLocation, locDraft, router, setState]);

  const trustMini = (
    <section
      className="h-fit rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
      aria-label="Why choose Shalean"
    >
      <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Why choose Shalean</h2>

      <ul className="mt-4 space-y-3">
        {SIDEBAR_BENEFITS.map(({ title, line, Icon }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
              <p className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">{line}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-zinc-800 dark:bg-blue-950/40 dark:text-blue-50">
        Cleaner home. Less stress.
      </div>
    </section>
  );

  const addressEmpty = addressBlurred && locDraft.trim().length === 0;
  const addressShort = locDraft.trim().length > 0 && locDraft.trim().length < 3;
  const propertyNeeded = locDraft.trim().length >= 3 && state.propertyType === null;

  return (
    <BookingLayout
      summaryOverride={trustMini}
      canContinue={canContinue}
      onContinue={goQuote}
      continueLabel={copy.cta}
      footerSubcopy={<p className="text-center text-xs text-zinc-500 dark:text-zinc-400">No payment yet</p>}
    >
      <div className="mx-auto max-w-2xl space-y-8 pb-6 lg:mx-0">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{heading}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{subheading}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="entry-location" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {copy.addressLabel}
          </label>
          <input
            id="entry-location"
            type="text"
            autoComplete="street-address"
            placeholder={copy.addressPlaceholder}
            value={locDraft}
            onChange={(e) => setLocDraft(e.target.value.slice(0, 500))}
            onBlur={() => {
              setAddressBlurred(true);
              commitLocation(locDraft);
            }}
            suppressHydrationWarning
            className="h-14 w-full rounded-2xl border border-zinc-200/90 bg-white px-4 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-primary/80"
          />
          {addressEmpty ? (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
              {bookingCopy.errors.address}
            </p>
          ) : null}
          {addressShort ? (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
              {bookingCopy.errors.addressShort}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{copy.propertyLabel}</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {PROPERTY_OPTIONS.map(({ id, label, Icon }) => {
              const active = state.propertyType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPropertyType(id)}
                  suppressHydrationWarning
                  className={cn(
                    "flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center text-sm font-semibold transition-all",
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-600/15 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                      : "border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-200 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-900/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border text-zinc-700 transition-colors dark:text-zinc-200",
                      active
                        ? "border-blue-200 bg-white text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {propertyNeeded ? (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
              {bookingCopy.errors.property}
            </p>
          ) : null}
        </div>
      </div>
    </BookingLayout>
  );
}
