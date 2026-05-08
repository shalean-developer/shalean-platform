"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { generateBookingTimeSlots } from "@/lib/booking/bookingTimeSlots";

export type TimeSlotModel = {
  time: string;
  isAvailable: boolean;
  isPast: boolean;
};

/** First N bookable slots shown before “see more” (checkout). */
const SLOT_PREVIEW_COUNT = 5;
const MID_AFTERNOON_MINUTES = 17 * 60;

/** Below `lg`: horizontal scroll strip (like date chips); `lg+`: grid. */
const checkoutSlotStripBase =
  "gap-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:flex max-lg:flex-nowrap max-lg:snap-x max-lg:snap-mandatory max-lg:overflow-x-auto max-lg:scroll-smooth";

const checkoutSlotChipWrap = "max-lg:w-[4.75rem] max-lg:shrink-0 max-lg:snap-center lg:min-w-0 lg:w-auto";

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
  variant?: "default" | "checkout";
  bandLabels?: { morning: string; midday: string; evening: string };
  seeMoreTimeSlotsLabel?: string;
  seeFewerTimeSlotsLabel?: string;
};

export function ScheduleTimeSlots({
  dateYmd,
  value,
  onChange,
  availability,
  variant = "default",
  bandLabels = { morning: "Morning", midday: "Midday", evening: "Evening" },
  seeMoreTimeSlotsLabel = "See more time slots",
  seeFewerTimeSlotsLabel = "See fewer time slots",
}: ScheduleTimeSlotsProps) {
  const middayRef = useRef<HTMLDivElement>(null);
  const eveningRef = useRef<HTMLDivElement>(null);
  const [morningMore, setMorningMore] = useState(false);
  const [middayMore, setMiddayMore] = useState(false);
  const [eveningMore, setEveningMore] = useState(false);

  const models = useMemo(
    () => buildScheduleSlotModels(dateYmd, availability, new Date()),
    [dateYmd, availability],
  );

  const visibleTimes = useMemo(() => filterRenderableScheduleSlots(models), [models]);

  const morning = useMemo(() => visibleTimes.filter((t) => slotToMinutes(t) < 12 * 60), [visibleTimes]);
  const midday = useMemo(
    () =>
      visibleTimes.filter((t) => {
        const m = slotToMinutes(t);
        return m >= 12 * 60 && m < MID_AFTERNOON_MINUTES;
      }),
    [visibleTimes],
  );
  const evening = useMemo(() => visibleTimes.filter((t) => slotToMinutes(t) >= MID_AFTERNOON_MINUTES), [visibleTimes]);

  const scrollToMidday = useCallback(() => {
    middayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToEvening = useCallback(() => {
    eveningRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const checkout = variant === "checkout";
  const gridClassDefaultVariant =
    "grid grid-cols-2 gap-2 transition-all duration-200 sm:grid-cols-3 sm:gap-3";

  const bandTitleClass = checkout
    ? "text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400"
    : "text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300";

  const slotBtn = (slot: string) => {
    const isSelected = value === slot;
    return (
      <button
        type="button"
        onClick={() => onChange(slot)}
        className={cn(
          "w-full rounded-xl border-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400/35 dark:focus-visible:ring-offset-zinc-950",
          checkout ? "min-h-[50px] px-1 py-2.5 sm:min-h-[52px]" : "min-h-[48px] py-2.5 sm:min-h-[52px] sm:py-3",
          isSelected
            ? checkout
              ? "z-[1] scale-[1.02] border-blue-600 bg-white text-blue-700 shadow-md shadow-blue-600/15 ring-2 ring-blue-600/35 dark:border-blue-500 dark:bg-zinc-950 dark:text-blue-300 dark:ring-blue-500/40"
              : "border-blue-600 bg-blue-50 text-blue-950 shadow-sm ring-2 ring-blue-600/25 dark:border-blue-500 dark:bg-blue-950/55 dark:text-blue-50 dark:ring-blue-400/30"
            : "border-zinc-200/90 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500",
        )}
      >
        {slot}
      </button>
    );
  };

  const jumpClass =
    "text-[11px] font-semibold uppercase tracking-wide text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400";

  const renderBandSlots = (
    band: string[],
    expanded: boolean,
    setExpanded: (next: boolean) => void,
    defaultMoreButtonClass: string,
  ) => {
    const overflow = band.length > SLOT_PREVIEW_COUNT;
    const previewSlots = band.slice(0, SLOT_PREVIEW_COUNT);

    if (!checkout) {
      const shown = expanded ? band : previewSlots;
      return (
        <>
          <div className={gridClassDefaultVariant}>
            {shown.map((t) => (
              <Fragment key={t}>{slotBtn(t)}</Fragment>
            ))}
          </div>
          {overflow ? (
            <button
              type="button"
              className={cn(
                "mt-2 text-sm font-semibold transition-colors hover:text-blue-900 dark:hover:text-blue-200",
                defaultMoreButtonClass,
              )}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Less" : "More"}
            </button>
          ) : null}
        </>
      );
    }

    if (!overflow) {
      return (
        <div
          className={cn(
            checkoutSlotStripBase,
            "lg:grid lg:grid-cols-5 lg:gap-2.5 lg:overflow-visible lg:pb-0",
          )}
        >
          {band.map((t) => (
            <div key={t} className={checkoutSlotChipWrap}>
              {slotBtn(t)}
            </div>
          ))}
        </div>
      );
    }

    if (!expanded) {
      return (
        <div
          className={cn(
            checkoutSlotStripBase,
            "lg:grid lg:grid-cols-6 lg:items-stretch lg:gap-2.5 lg:overflow-visible lg:pb-0",
          )}
        >
          {previewSlots.map((t) => (
            <div key={t} className={checkoutSlotChipWrap}>
              {slotBtn(t)}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              "flex items-center text-left text-sm font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400",
              "max-lg:snap-center max-lg:max-w-[9.5rem] max-lg:shrink-0 max-lg:self-center max-lg:py-2 max-lg:pr-1",
              "lg:flex lg:items-center lg:justify-start lg:py-0",
            )}
          >
            {seeMoreTimeSlotsLabel}
          </button>
        </div>
      );
    }

    return (
      <>
        <div
          className={cn(
            checkoutSlotStripBase,
            "lg:grid lg:grid-cols-5 lg:gap-2.5 lg:overflow-visible lg:pb-0",
          )}
        >
          {band.map((t) => (
            <div key={t} className={checkoutSlotChipWrap}>
              {slotBtn(t)}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          onClick={() => setExpanded(false)}
        >
          {seeFewerTimeSlotsLabel}
        </button>
      </>
    );
  };

  return (
    <div className={checkout ? "space-y-4" : "space-y-5"}>
      {morning.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={
                checkout
                  ? bandTitleClass
                  : "text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300"
              }
            >
              {bandLabels.morning}
            </p>
            {midday.length > 0 ? (
              <button type="button" onClick={scrollToMidday} className={jumpClass}>
                {bandLabels.midday} →
              </button>
            ) : evening.length > 0 ? (
              <button type="button" onClick={scrollToEvening} className={jumpClass}>
                {bandLabels.evening} →
              </button>
            ) : null}
          </div>
          {renderBandSlots(
            morning,
            morningMore,
            setMorningMore,
            "text-blue-800 dark:text-blue-300",
          )}
        </div>
      ) : null}

      {midday.length > 0 ? (
        <div ref={middayRef} className="scroll-mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={
                checkout
                  ? bandTitleClass
                  : "text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
              }
            >
              {bandLabels.midday}
            </p>
            {evening.length > 0 ? (
              <button type="button" onClick={scrollToEvening} className={jumpClass}>
                {bandLabels.evening} →
              </button>
            ) : null}
          </div>
          {renderBandSlots(
            midday,
            middayMore,
            setMiddayMore,
            "text-zinc-700 dark:text-zinc-300",
          )}
        </div>
      ) : null}

      {evening.length > 0 ? (
        <div ref={eveningRef} className="scroll-mt-4">
          <p className={cn("mb-2", bandTitleClass)}>{bandLabels.evening}</p>
          {renderBandSlots(
            evening,
            eveningMore,
            setEveningMore,
            "text-zinc-700 dark:text-zinc-300",
          )}
        </div>
      ) : null}
    </div>
  );
}
