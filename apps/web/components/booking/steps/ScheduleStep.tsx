"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import type { ServiceAreaSelection } from "@/components/booking/ServiceAreaPicker";
import { ScheduleDateScroller, generateScheduleDateRange } from "@/components/booking/schedule/ScheduleDateScroller";
import { ScheduleLocationSearch } from "@/components/booking/schedule/ScheduleLocationSearch";
import { ScheduleTimeSlots, getRenderableScheduleTimes } from "@/components/booking/schedule/ScheduleTimeSlots";
import { defaultBookingTimeForDate } from "@/lib/booking/bookingTimeSlots";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const sch = bookingCopy.checkoutSchedule;

function formatAvailabilityHighlight(dateYmd: string, time: string): string {
  const parsed = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return `${dateYmd} at ${time}`;
  const wd = parsed.toLocaleDateString("en-ZA", { weekday: "short" });
  const md = parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  return `${wd}, ${md} at ${time}`;
}

type ScheduleStepProps = {
  date: string | null;
  time: string | null;
  location: string;
  locationSlug: string | null;
  serviceAreaLocationId: string | null;
  serviceAreaName: string;
  onDateChange: (date: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onLocationChange: (location: string) => void;
  onServiceAreaChange: (next: ServiceAreaSelection) => void;
  onAreaHintSelect: (slug: string, displayName: string) => void;
};

export function ScheduleStep({
  date,
  time,
  location,
  locationSlug,
  serviceAreaLocationId,
  serviceAreaName,
  onDateChange,
  onTimeChange,
  onLocationChange,
  onServiceAreaChange,
  onAreaHintSelect,
}: ScheduleStepProps) {
  const [addressExpanded, setAddressExpanded] = useState(() => !location.trim());

  const firstBookableDate = useMemo(() => {
    const chips = generateScheduleDateRange(90);
    return chips.find((c) => !c.isPast && !c.unavailable)?.value ?? null;
  }, []);

  const slotsForDate = useMemo(() => (date ? getRenderableScheduleTimes(date) : []), [date]);

  useEffect(() => {
    if (!date && firstBookableDate) {
      useBookingCheckoutStore.getState().patch({ date: firstBookableDate });
    }
  }, [date, firstBookableDate]);

  useEffect(() => {
    if (!date) return;
    const allowed = getRenderableScheduleTimes(date);
    if (allowed.length === 0) {
      useBookingCheckoutStore.getState().patch({ time: null });
      return;
    }
    const cur = useBookingCheckoutStore.getState().time;
    if (!cur || !allowed.includes(cur)) {
      const preferred = defaultBookingTimeForDate(date);
      const next = allowed.includes(preferred) ? preferred : allowed[0]!;
      useBookingCheckoutStore.getState().patch({ time: next });
    }
  }, [date, time]);

  const showAvailabilityBanner = Boolean(date && time && slotsForDate.length > 0);
  const showNoTimesBanner = Boolean(date && slotsForDate.length === 0);

  return (
    <div className="space-y-5 max-lg:space-y-4">
      <ScheduleLocationSearch
        serviceAreaLocationId={serviceAreaLocationId}
        locationSlug={locationSlug}
        serviceAreaName={serviceAreaName}
        onApiSelect={onServiceAreaChange}
        onHintSelect={onAreaHintSelect}
        label={sch.areaLabel}
        placeholder={sch.areaSearchPlaceholder}
        showValidationAffordance
      />

      <ScheduleDateScroller
        value={date}
        onChange={onDateChange}
        variant="checkout"
        sectionLabel={sch.dateLabel}
        ariaScrollLeft={sch.scrollDatesLeft}
        ariaScrollRight={sch.scrollDatesRight}
      />

      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{sch.timeLabel}</p>
        <ScheduleTimeSlots
          key={date ?? "no-date"}
          dateYmd={date}
          value={time}
          onChange={onTimeChange}
          variant="checkout"
          bandLabels={{ morning: sch.morning, midday: sch.midday, evening: sch.evening }}
          seeMoreTimeSlotsLabel={sch.seeMoreTimeSlots}
          seeFewerTimeSlotsLabel={sch.seeFewerTimeSlots}
        />
      </div>

      {showAvailabilityBanner && date && time ? (
        <div
          className="flex gap-2.5 rounded-xl border border-blue-100/90 bg-blue-50/70 px-3 py-2.5 dark:border-blue-900/35 dark:bg-blue-950/35"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
          <p className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">
            {sch.availabilityLead}{" "}
            <span className="font-semibold text-blue-700 dark:text-blue-400">
              {formatAvailabilityHighlight(date, time)}
            </span>
          </p>
        </div>
      ) : null}

      {showNoTimesBanner ? (
        <div
          className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50"
          role="status"
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{sch.noTimesTitle}</p>
          <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">{sch.noTimesBody}</p>
        </div>
      ) : null}

      <div className="pt-1">
        {location.trim() && !addressExpanded ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/40 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{sch.addressLabel}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                {location}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={() => setAddressExpanded(true)}
            >
              {sch.addressEdit}
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor="booking-address" className="mb-2 block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {sch.addressLabel}
            </label>
            <textarea
              id="booking-address"
              rows={3}
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              onBlur={() => {
                if (location.trim()) setAddressExpanded(false);
              }}
              placeholder={sch.addressPlaceholder}
              className={cn(
                "min-h-[52px] w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none transition-all duration-200",
                "focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
              )}
            />
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{sch.addressMicrocopy}</p>
          </div>
        )}
      </div>
    </div>
  );
}
