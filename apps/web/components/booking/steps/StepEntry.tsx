"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingStep1, type PropertyTypeKind } from "@/components/booking/useBookingStep1";

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

const PROPERTY_IDS = ["apartment", "house"] as const;

export function StepEntry() {
  const router = useRouter();
  const booking = useBookingStep1();
  const { state, setState } = booking;
  const copy = bookingCopy.entry;

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
      className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
      aria-label="Why book with Shalean"
    >
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Why homeowners choose us</h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
    </section>
  );

  const addressEmpty = addressBlurred && locDraft.trim().length === 0;
  const addressShort = locDraft.trim().length > 0 && locDraft.trim().length < 3;
  const propertyNeeded = locDraft.trim().length >= 3 && state.propertyType === null;

  return (
    <BookingLayout
      useFlowHeader
      summaryOverride={trustMini}
      stepLabel="Step 1 of 5"
      canContinue={canContinue}
      onContinue={goQuote}
      continueLabel={copy.cta}
      footerSubcopy={<p className="text-center text-xs text-zinc-500 dark:text-zinc-400">No payment yet</p>}
    >
      <div className="mx-auto max-w-xl space-y-8 pb-6 lg:mx-0">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
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
          <div className="grid grid-cols-2 gap-3">
            {PROPERTY_IDS.map((id, i) => {
              const active = state.propertyType === id;
              const label = copy.propertyOptions[i] ?? id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPropertyType(id)}
                  suppressHydrationWarning
                  className={[
                    "rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition-all",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-sm dark:bg-primary/15"
                      : "border-zinc-200/90 bg-white text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600",
                  ].join(" ")}
                >
                  {label}
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
