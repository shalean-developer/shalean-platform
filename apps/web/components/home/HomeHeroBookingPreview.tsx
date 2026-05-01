"use client";

import { useMemo } from "react";
import Link from "next/link";
import { calculateHomeWidgetBaseEstimateZar } from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import {
  BOOKING_SLOT_END_HOUR,
  BOOKING_SLOT_END_MINUTE,
  BOOKING_SLOT_START_HOUR,
  defaultBookingTimeForDate,
  formatBookingDayButtonLabel,
  todayBookingYmd,
} from "@/lib/booking/bookingTimeSlots";
import { widgetServiceLabel } from "@/lib/booking/widgetServiceGroups";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cn } from "@/lib/utils";

const PREVIEW_SERVICE = "standard" as const;

function formatNextAvailableLine(dateYmd: string, timeHm: string, now: Date): string {
  const today = todayBookingYmd(now);
  if (dateYmd === today) return `Today at ${timeHm}`;
  return `${formatBookingDayButtonLabel(dateYmd)} · ${timeHm}`;
}

export function HomeHeroBookingPreview({ className }: { className?: string }) {
  const { snapshot: catalog } = usePricingCatalogSnapshot();
  const { nextAvailable, price, serviceLabel, windowLabel } = useMemo(() => {
    const now = new Date();
    const ymd = todayBookingYmd(now);
    const t = defaultBookingTimeForDate(ymd, now);
    const start = `${String(BOOKING_SLOT_START_HOUR).padStart(2, "0")}:00`;
    const end = `${String(BOOKING_SLOT_END_HOUR).padStart(2, "0")}:${String(BOOKING_SLOT_END_MINUTE).padStart(2, "0")}`;
    return {
      nextAvailable: formatNextAvailableLine(ymd, t, now),
      price: catalog != null ? calculateHomeWidgetBaseEstimateZar(PREVIEW_SERVICE, catalog) : null,
      serviceLabel: widgetServiceLabel(PREVIEW_SERVICE),
      windowLabel: `${start} - ${end}`,
    };
  }, [catalog]);

  const cardBtnClass = cn(
    "inline-flex w-full min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-md transition",
    "hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
    "dark:bg-emerald-600 dark:hover:bg-emerald-500",
  );

  return (
    <div className={cn("relative mx-auto w-full max-w-md", className)}>
      <div
        className={cn(
          "absolute -top-4 right-0 z-10 max-w-[11rem] rounded-xl bg-emerald-600 px-4 py-3 text-white shadow-lg sm:-top-6",
          "dark:bg-emerald-600",
        )}
        role="status"
      >
        <p className="text-xs font-medium text-emerald-50">Available today</p>
        <p className="mt-0.5 text-sm font-bold tabular-nums">{windowLabel}</p>
      </div>

      <div className="relative rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Service</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{serviceLabel}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Location</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">Cape Town</p>
        </div>
        <div className="mb-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Next available</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{nextAvailable}</p>
        </div>
        <div className="mb-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Starting from</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {price != null ? `R ${price.toLocaleString("en-ZA")}` : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Estimate — full form below refines your total.
          </p>
        </div>
        <GrowthCtaLink href="#home-booking" source="home_hero_preview_card" className={cardBtnClass}>
          Continue booking
        </GrowthCtaLink>
        <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/booking/details?source=home_hero" className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
            Open full booking page
          </Link>
        </p>
      </div>
    </div>
  );
}
