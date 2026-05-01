"use client";

import { useEffect, useMemo } from "react";
import type { ServiceAreaSelection } from "@/components/booking/ServiceAreaPicker";
import { ScheduleDateScroller, generateScheduleDateRange } from "@/components/booking/schedule/ScheduleDateScroller";
import { ScheduleLocationSearch } from "@/components/booking/schedule/ScheduleLocationSearch";
import { ScheduleTimeSlots, getRenderableScheduleTimes } from "@/components/booking/schedule/ScheduleTimeSlots";
import { defaultBookingTimeForDate } from "@/lib/booking/bookingTimeSlots";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";

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
  const firstBookableDate = useMemo(() => {
    const chips = generateScheduleDateRange(90);
    return chips.find((c) => !c.isPast && !c.unavailable)?.value ?? null;
  }, []);

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

  return (
    <div className="space-y-6">
      <ScheduleLocationSearch
        serviceAreaLocationId={serviceAreaLocationId}
        locationSlug={locationSlug}
        serviceAreaName={serviceAreaName}
        onApiSelect={onServiceAreaChange}
        onHintSelect={onAreaHintSelect}
      />

      <ScheduleDateScroller value={date} onChange={onDateChange} />

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Time</p>
        <ScheduleTimeSlots dateYmd={date} value={time} onChange={onTimeChange} />
      </div>

      <div>
        <label htmlFor="booking-address" className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Street address
        </label>
        <textarea
          id="booking-address"
          rows={3}
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="Street number, building, unit, gate code"
          className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Street, unit, gate code — for your door.</p>
      </div>
    </div>
  );
}
