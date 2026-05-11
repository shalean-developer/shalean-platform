"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AvailableCleanerDto } from "@/lib/booking/cleanerMarketingDto";
import { CheckoutCleanerCard } from "@/components/booking/checkout/CheckoutCleanerCard";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import { useCleaners, type LiveCleaner } from "@/components/booking/useCleaners";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { checkoutSidebarPriceDisplay } from "@/lib/booking/checkoutSidebarPricing";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";
import { cn } from "@/lib/utils";

const copy = bookingCopy.checkoutCleaner;

type CleanerStepProps = {
  cleanerId: string | null | undefined;
};

/** Deep/move jobs use crew assignment elsewhere — same gate as slot picker prefetch. */
function isTeamAssignedService(service: string): boolean {
  const v = service.toLowerCase();
  return v.includes("deep") || v.includes("move");
}

function liveCleanerToCheckoutDto(c: LiveCleaner): AvailableCleanerDto {
  const rating = Number.isFinite(c.rating) ? c.rating : 0;
  const jobs = Math.max(0, Math.round(Number(c.jobs_completed)));
  const recommendPct = Math.min(100, Math.max(0, Math.round((rating / 5) * 100)));
  return {
    id: c.id,
    name: (c.full_name ?? "").trim() || "Cleaner",
    rating,
    jobs,
    recommendPct,
    image: null,
  };
}

export function CleanerStep({ cleanerId }: CleanerStepProps) {
  const patch = useBookingCheckoutStore((s) => s.patch);
  const service = useBookingCheckoutStore((s) => s.service);
  const date = useBookingCheckoutStore((s) => s.date);
  const time = useBookingCheckoutStore((s) => s.time);
  const serviceAreaLocationId = useBookingCheckoutStore((s) => s.serviceAreaLocationId);
  const bedrooms = useBookingCheckoutStore((s) => s.bedrooms);
  const bathrooms = useBookingCheckoutStore((s) => s.bathrooms);
  const extraRooms = useBookingCheckoutStore((s) => s.extraRooms);
  const extras = useBookingCheckoutStore((s) => s.extras);

  const { data: catalog, loading: catalogLoading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;

  const sid = useMemo(() => parseBookingServiceId(service), [service]);
  const durationMinutes = useMemo(() => {
    const { hours } = checkoutSidebarPriceDisplay({
      snapshot,
      segment: "cleaner",
      service: sid,
      bedrooms,
      bathrooms,
      extraRooms,
      extras,
      time,
    });
    if (!snapshot || !sid || !Number.isFinite(hours) || hours <= 0) return 120;
    return Math.max(30, Math.round(hours * 60));
  }, [snapshot, sid, bedrooms, bathrooms, extraRooms, extras, time]);

  const teamService = useMemo(() => isTeamAssignedService(service), [service]);
  const locationId = typeof serviceAreaLocationId === "string" ? serviceAreaLocationId.trim() : "";
  const slotReady = Boolean(date && time && locationId);

  const {
    cleaners: liveCleaners,
    loading,
    error: fetchError,
  } = useCleaners({
    selectedDate: date,
    selectedTime: time,
    durationMinutes,
    locationId: locationId || null,
    serviceType: service,
    enabled: !teamService && slotReady,
  });

  const cleaners = useMemo(() => liveCleaners.map(liveCleanerToCheckoutDto), [liveCleaners]);

  const auto = cleanerId == null || cleanerId === "";
  const [browseOpen, setBrowseOpen] = useState(() => !auto);

  useEffect(() => {
    if (!auto) setBrowseOpen(true);
  }, [auto]);

  const selectAuto = useCallback(() => {
    patch({ cleanerId: null, cleanerDisplayName: null });
    setBrowseOpen(false);
  }, [patch]);

  const toggleBrowse = useCallback(() => {
    setBrowseOpen((o) => !o);
  }, []);

  return (
    <div className="space-y-3 sm:space-y-4">
      <button
        type="button"
        onClick={selectAuto}
        className={cn(
          "relative flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:gap-4 sm:p-5",
          auto
            ? "border-blue-600 bg-gradient-to-br from-blue-50/95 via-white to-white ring-2 ring-blue-600/15 dark:border-blue-500 dark:from-blue-950/35 dark:via-zinc-950 dark:to-zinc-950 dark:ring-blue-500/20"
            : "border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:h-6 sm:w-6",
            auto ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600" : "border-zinc-300 dark:border-zinc-600",
          )}
          aria-hidden
        >
          {auto ? <span className="h-2 w-2 rounded-full bg-white sm:h-2.5 sm:w-2.5" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50 sm:text-base">
              {copy.bestAvailableTitle}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/90 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-800/80">
              {copy.recommendedBadge}
            </span>
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {copy.bestAvailableBody}
          </span>
        </span>
      </button>

      <div
        className={cn(
          "rounded-xl border bg-white shadow-sm dark:bg-zinc-950",
          !auto ? "border-zinc-300 dark:border-zinc-600" : "border-zinc-200/90 dark:border-zinc-800",
        )}
      >
        <button
          type="button"
          onClick={toggleBrowse}
          className="flex w-full min-h-[52px] items-center gap-3 px-3.5 py-3 text-left transition hover:bg-zinc-50/90 dark:hover:bg-zinc-900/60 sm:min-h-[56px] sm:gap-4 sm:px-4 sm:py-3.5"
          aria-expanded={browseOpen}
        >
          <span
            className={cn(
              "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 sm:h-6 sm:w-6",
              !auto
                ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-600"
                : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
            )}
            aria-hidden
          >
            {!auto ? <span className="h-2 w-2 rounded-full bg-white sm:h-2.5 sm:w-2.5" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 sm:text-base">
              {copy.manualTitle}
            </span>
            <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400 sm:hidden">{copy.manualSubtitleMobile}</span>
            <span className="mt-0.5 hidden text-sm text-zinc-500 dark:text-zinc-400 sm:block">
              {copy.manualSubtitleDesktop}
            </span>
          </span>
          <ChevronRight
            className={cn(
              "h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 dark:text-zinc-500",
              browseOpen && "rotate-90",
            )}
            aria-hidden
          />
        </button>

        {browseOpen ? (
          <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-3 dark:border-zinc-800 sm:px-4 sm:pb-4">
            {teamService ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                This service uses a crew assignment flow — {copy.bestAvailableTitle.toLowerCase()} is recommended.
              </p>
            ) : null}
            {!teamService && !slotReady ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Confirm date, time, and service area on the schedule step to browse cleaners for your slot.
              </p>
            ) : null}
            {fetchError ? <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p> : null}
            {(loading || catalogLoading) && slotReady && !teamService ? (
              <div className="space-y-2">
                <div className="h-[4.25rem] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-[4.25rem] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ) : null}
            {!loading &&
            !catalogLoading &&
            cleaners.length === 0 &&
            !fetchError &&
            slotReady &&
            !teamService ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No cleaners to show — {copy.bestAvailableTitle.toLowerCase()} is recommended.
              </p>
            ) : null}
            <ul className="space-y-2.5">
              {cleaners.map((c) => (
                <li key={c.id}>
                  <CheckoutCleanerCard
                    cleaner={c}
                    selected={cleanerId === c.id}
                    onChoose={() => patch({ cleanerId: c.id, cleanerDisplayName: c.name })}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
