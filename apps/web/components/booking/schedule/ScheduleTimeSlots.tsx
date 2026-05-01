"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { generateBookingTimeSlots } from "@/lib/booking/bookingTimeSlots";

export type TimeSlotModel = {
  time: string;
  isAvailable: boolean;
  isPast: boolean;
};

const INITIAL_VISIBLE = 5;

function slotToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isSlotPastOnDate(slot: string, dateYmd: string | null, now: Date): boolean {
  if (!dateYmd) return false;
  const [yy, mm, dd] = dateYmd.split("-").map(Number);
  if (!yy || !mm || !dd) return false;
  const slotDt = new Date(yy, mm - 1, dd, ...slot.split(":").map(Number) as [number, number], 0, 0);
  return slotDt <= now;
}

export function buildScheduleSlotModels(
  dateYmd: string | null,
  availability: Record<string, boolean> | undefined,
  now: Date,
): TimeSlotModel[] {
  const slots = generateBookingTimeSlots();
  return slots.map((time) => {
    const isPast = isSlotPastOnDate(time, dateYmd, now);
    const isAvailable = availability?.[time] ?? true;
    return { time, isAvailable, isPast };
  });
}

export function filterRenderableScheduleSlots(models: TimeSlotModel[]): string[] {
  return models.filter((m) => m.isAvailable && !m.isPast).map((m) => m.time);
}

/** Times that should be offered for `dateYmd` (excludes past + unavailable). */
export function getRenderableScheduleTimes(
  dateYmd: string | null,
  availability?: Record<string, boolean>,
): string[] {
  return filterRenderableScheduleSlots(buildScheduleSlotModels(dateYmd, availability, new Date()));
}

type ScheduleTimeSlotsProps = {
  dateYmd: string | null;
  value: string | null;
  onChange: (time: string | null) => void;
  /** Per `HH:mm` — false = treated unavailable (hidden). */
  availability?: Record<string, boolean>;
};

export function ScheduleTimeSlots({ dateYmd, value, onChange, availability }: ScheduleTimeSlotsProps) {
  const middayRef = useRef<HTMLDivElement>(null);
  const [morningMore, setMorningMore] = useState(false);
  const [middayMore, setMiddayMore] = useState(false);

  useEffect(() => {
    setMorningMore(false);
    setMiddayMore(false);
  }, [dateYmd]);

  const models = useMemo(
    () => buildScheduleSlotModels(dateYmd, availability, new Date()),
    [dateYmd, availability],
  );

  const visibleTimes = useMemo(() => filterRenderableScheduleSlots(models), [models]);

  const morning = useMemo(() => visibleTimes.filter((t) => slotToMinutes(t) < 12 * 60), [visibleTimes]);
  const midday = useMemo(() => visibleTimes.filter((t) => slotToMinutes(t) >= 12 * 60), [visibleTimes]);

  const morningShown = morningMore ? morning : morning.slice(0, INITIAL_VISIBLE);
  const middayShown = middayMore ? midday : midday.slice(0, INITIAL_VISIBLE);

  const scrollToMidday = useCallback(() => {
    middayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const slotBtn = (slot: string) => {
    const isSelected = value === slot;
    return (
      <button
        key={slot}
        type="button"
        onClick={() => onChange(slot)}
        className={cn(
          "rounded-xl border py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:py-3 dark:focus-visible:ring-blue-400/35",
          isSelected
            ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-100"
            : "border-gray-200 bg-white text-zinc-900 hover:border-gray-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500",
        )}
      >
        {slot}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Morning</p>
          {morning.length > 0 && midday.length > 0 ? (
            <button
              type="button"
              onClick={scrollToMidday}
              className="text-xs font-semibold uppercase tracking-wide text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              Midday →
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 transition-all duration-200 sm:grid-cols-3 sm:gap-3">
          {morningShown.map((t) => slotBtn(t))}
        </div>
        {morning.length > INITIAL_VISIBLE ? (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-blue-800 transition-colors hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
            onClick={() => setMorningMore((v) => !v)}
          >
            {morningMore ? "Less" : "More"}
          </button>
        ) : null}
      </div>

      <div ref={middayRef} className="scroll-mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Midday</p>
        <div className="grid grid-cols-2 gap-2 transition-all duration-200 sm:grid-cols-3 sm:gap-3">
          {middayShown.map((t) => slotBtn(t))}
        </div>
        {midday.length > INITIAL_VISIBLE ? (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            onClick={() => setMiddayMore((v) => !v)}
          >
            {middayMore ? "Less" : "More"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
