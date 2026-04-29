"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, Building2, Home, Info, MapPin, PanelsTopLeft, type LucideIcon } from "lucide-react";
import BookingLayout from "@/components/booking/BookingLayout";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { bookingCopy } from "@/lib/booking/copy";
import { bookingServiceIdFromType } from "@/components/booking/serviceCategories";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { useBookingStep1, type PropertyTypeKind } from "@/components/booking/useBookingStep1";
import { cn } from "@/lib/utils";
import { ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";

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

/** Short lines for mobile bottom sheet */
const TRUST_SHEET_LINES = [
  "Trusted & verified",
  "Fast booking",
  "Flexible scheduling",
  "Satisfaction guarantee",
];

export function StepEntry() {
  const router = useRouter();
  const { bookingHref } = useBookingFlow();
  const booking = useBookingStep1();
  const { state, setState } = booking;
  const copy = bookingCopy.entry;

  const [streetDraft, setStreetDraft] = useState(state.location);
  const [suburbBlurred, setSuburbBlurred] = useState(false);
  const [areaCoverage, setAreaCoverage] = useState({ count: 0, error: null as string | null, ready: false });
  const [entryContinueGate, setEntryContinueGate] = useState(false);
  const [trustSheetOpen, setTrustSheetOpen] = useState(false);
  const [addressHelpOpen, setAddressHelpOpen] = useState(false);
  const addressHelpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEntryContinueGate(true);
  }, []);

  useEffect(() => {
    if (!addressHelpOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!addressHelpRef.current?.contains(e.target as Node)) setAddressHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddressHelpOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [addressHelpOpen]);

  useEffect(() => {
    setStreetDraft(state.location);
  }, [state.location]);

  const onServiceAreasLoaded = useCallback((count: number, error: string | null) => {
    setAreaCoverage({ count, error, ready: true });
  }, []);

  useEffect(() => {
    if (!trustSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrustSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [trustSheetOpen]);

  const commitStreet = useCallback(
    (v: string) => {
      setState((p) => ({ ...p, location: v.slice(0, 500) }));
    },
    [setState],
  );

  useDebouncedCommit(streetDraft, commitStreet, 320, state.location);

  const setPropertyType = useCallback(
    (propertyType: PropertyTypeKind) => {
      setState((p) => ({ ...p, propertyType }));
    },
    [setState],
  );

  const suburbOk = Boolean(state.serviceAreaLocationId);
  const canContinue =
    suburbOk &&
    state.propertyType !== null &&
    (!entryContinueGate || booking.hydrated) &&
    areaCoverage.ready &&
    areaCoverage.count > 0 &&
    !areaCoverage.error;

  const goQuote = useCallback(() => {
    if (!canContinue) return;
    trackBookingFunnelEvent("entry", "next", { route_step: "entry" });
    commitStreet(streetDraft);
    setState((p) => ({
      ...p,
      location: streetDraft.trim().slice(0, 500),
      allowLocationTextFallback: false,
      selectedCategory: "regular",
      service_group: "regular",
      service_type: "standard_cleaning",
      /** Always align with entry → quote default; do not keep a stale `service` from storage. */
      service: bookingServiceIdFromType("standard_cleaning"),
    }));
    router.push(bookingHref("quote"));
  }, [canContinue, commitStreet, streetDraft, router, setState, bookingHref]);

  const suburbMissing = suburbBlurred && !state.serviceAreaLocationId;

  return (
    <BookingLayout
      mobileEntryFooter
      footerEntryLead={copy.socialProof}
      canContinue={canContinue}
      onContinue={goQuote}
      continueLabel={copy.cta}
      showContinueArrow
    >
      <div className="w-full max-w-none space-y-4 pb-2 max-lg:space-y-4 md:mx-auto md:max-w-2xl lg:mx-auto lg:max-w-2xl lg:space-y-6 lg:pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 lg:mt-3 lg:text-base">
            {copy.addressMicrocopy}
          </p>
        </div>

        <div className="space-y-4 max-lg:space-y-3 lg:space-y-5">
          <div className="space-y-1.5 max-lg:space-y-1.5 lg:space-y-2">
            <div ref={addressHelpRef} className="relative flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-800 max-lg:text-xs dark:text-zinc-200 lg:text-sm">
                {copy.suburbLabel}
              </span>
              <button
                type="button"
                onClick={() => setAddressHelpOpen((o) => !o)}
                className={cn(
                  "inline-flex shrink-0 rounded-md p-0.5 text-zinc-400 outline-none transition hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-zinc-500 dark:hover:text-zinc-300",
                  addressHelpOpen && "text-blue-600 dark:text-blue-400",
                )}
                aria-expanded={addressHelpOpen}
                aria-controls="entry-suburb-help"
                aria-label="Why we ask for your suburb"
              >
                <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              {addressHelpOpen ? (
                <div
                  id="entry-suburb-help"
                  role="tooltip"
                  className="absolute left-0 top-full z-20 mt-1 w-[min(100%,22rem)] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs leading-snug text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {copy.suburbHelper}
                </div>
              ) : null}
            </div>
            <ServiceAreaPicker
              id="entry-service-area"
              value={state.serviceAreaLocationId}
              emptyListMessage={copy.emptyServiceAreaCoverage}
              onLocationsLoaded={onServiceAreasLoaded}
              onChange={(next) => {
                setState((p) => ({
                  ...p,
                  serviceAreaLocationId: next.locationId,
                  serviceAreaCityId: next.cityId,
                  serviceAreaName: next.name,
                  allowLocationTextFallback: false,
                }));
              }}
              onBlur={() => setSuburbBlurred(true)}
              placeholder={copy.suburbPlaceholder}
              loadingLabel="Loading suburbs…"
              className="h-14 rounded-xl text-sm lg:h-14 lg:text-base"
            />
            {suburbMissing ? (
              <p className="text-xs font-medium text-amber-800 dark:text-amber-400/90" role="status">
                {bookingCopy.errors.suburb}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5 max-lg:space-y-1.5 lg:space-y-2">
            <label
              htmlFor="entry-street"
              className="text-xs font-medium text-zinc-800 max-lg:text-xs dark:text-zinc-200 lg:text-sm"
            >
              {copy.streetLabel}
            </label>
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 lg:text-xs">{copy.streetHelper}</p>
            <div className="relative">
              <input
                id="entry-street"
                type="text"
                autoComplete="street-address"
                placeholder={copy.streetPlaceholder}
                value={streetDraft}
                onChange={(e) => setStreetDraft(e.target.value.slice(0, 500))}
                onBlur={() => commitStreet(streetDraft)}
                suppressHydrationWarning
                className="h-14 w-full cursor-text rounded-xl border border-gray-200 bg-white pl-4 pr-10 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-950/40 lg:rounded-2xl lg:text-base lg:leading-normal"
              />
              <div
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-400"
                aria-hidden
              >
                <MapPin className="h-5 w-5" strokeWidth={2} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 lg:space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 lg:text-sm">{copy.propertyLabel}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 lg:text-xs">{copy.propertyHint}</p>
          </div>

          <div className="grid grid-cols-4 gap-2 lg:hidden">
            {PROPERTY_OPTIONS.map(({ id, label, Icon }) => {
              const active = state.propertyType === id;
              return (
                <button
                  key={`m-${id}`}
                  type="button"
                  onClick={() => setPropertyType(id)}
                  suppressHydrationWarning
                  className={cn(
                    "flex min-h-[72px] min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-2 text-center text-[11px] font-medium leading-tight transition-all",
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-600/10 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600",
                  )}
                >
                  <Icon
                    className={cn(
                      "mb-1 h-7 w-7 shrink-0",
                      active ? "text-blue-700 dark:text-blue-200" : "text-zinc-600 dark:text-zinc-300",
                    )}
                    aria-hidden
                  />
                  <span className="line-clamp-2 w-full min-w-0 break-words">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden grid-cols-2 gap-4 lg:grid lg:grid-cols-4">
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
        </div>

        <div className="mt-3 text-center lg:hidden">
          <button
            type="button"
            onClick={() => setTrustSheetOpen(true)}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Why choose Shalean →
          </button>
        </div>
      </div>

      {trustSheetOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setTrustSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trust-sheet-title"
            className="absolute inset-x-0 bottom-0 max-h-[min(85vh,520px)] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
            <h2 id="trust-sheet-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Why choose Shalean
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              {TRUST_SHEET_LINES.map((line) => (
                <li key={line} className="flex gap-2 border-b border-zinc-100 pb-3 last:border-0 dark:border-zinc-800">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </BookingLayout>
  );
}
