"use client";
/* eslint-disable react-hooks/refs -- Floating UI `refs.setFloating` is a ref callback, not a read of `.current` during render */

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { format } from "date-fns";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import "react-day-picker/style.css";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  formatBookingDayButtonLabel,
  generateBookingTimeSlots,
  getAvailableBookingSlots,
  parseBookingDay,
  todayBookingYmd,
} from "@/lib/booking/bookingTimeSlots";
import { cn } from "@/lib/utils";

const DATE_TRIGGER_PANEL_GAP = 10;
const DATE_TRIGGER_WIDTH_CLASS = "w-[180px]";

const dayPickerClassNames = (): Record<string, string> => {
  const base = getDefaultClassNames();
  return {
    ...base,
    root: cn(base.root, "mx-auto w-full font-sans text-zinc-900 dark:text-zinc-100"),
    months: cn(base.months, "w-full"),
    month_caption: cn(
      base.month_caption,
      "mb-2 flex items-center justify-center text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-50",
    ),
    nav: cn(base.nav, "absolute inset-x-0 top-0 flex w-full justify-between"),
    button_previous: cn(
      base.button_previous,
      "inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
    ),
    button_next: cn(
      base.button_next,
      "inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
    ),
    month_grid: cn(base.month_grid, "w-full border-collapse"),
    weekdays: cn(base.weekdays, "mb-1"),
    weekday: cn(base.weekday, "text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400"),
    week: cn(base.week, ""),
    day: cn(
      base.day,
      "size-9 p-0 text-sm font-medium text-zinc-800 dark:text-zinc-100",
    ),
    day_button: cn(
      base.day_button,
      "size-9 rounded-lg border border-transparent hover:border-emerald-300/80 hover:bg-emerald-50/60 dark:hover:border-emerald-600/50 dark:hover:bg-emerald-950/40",
    ),
    selected: cn(
      base.selected,
      "[&_button]:border-emerald-600 [&_button]:bg-emerald-600 [&_button]:text-white [&_button]:hover:border-emerald-600 [&_button]:hover:bg-emerald-600",
    ),
    today: cn(base.today, "[&_button]:ring-2 [&_button]:ring-emerald-500/40"),
    disabled: cn(base.disabled, "opacity-40"),
    outside: cn(base.outside, "opacity-40"),
  };
};

export type BookingDateTimeSectionProps = {
  date: string;
  time: string;
  onDateChange: (ymd: string) => void;
  onTimeChange: (hhmm: string) => void;
  /** Earliest selectable calendar day (`yyyy-MM-dd`). Defaults to today (local). */
  minDateYmd?: string;
  dateTriggerId?: string;
};

export function BookingDateTimeSection({
  date,
  time,
  onDateChange,
  onTimeChange,
  minDateYmd,
  dateTriggerId,
}: BookingDateTimeSectionProps) {
  const reactId = useId();
  const triggerDomId = dateTriggerId ?? `${reactId}-date-trigger`;
  const labelId = `${reactId}-date-label`;

  const [dateOpen, setDateOpen] = useState(false);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [slotClock, setSlotClock] = useState(() => new Date());

  const minDay = minDateYmd ?? todayBookingYmd();

  useEffect(() => {
    const id = window.setInterval(() => setSlotClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const allSlots = useMemo(() => generateBookingTimeSlots(), []);
  const availableSlots = useMemo(
    () => getAvailableBookingSlots(allSlots, date, slotClock),
    [allSlots, date, slotClock],
  );

  useEffect(() => {
    const avail = getAvailableBookingSlots(generateBookingTimeSlots(), date, slotClock);
    if (avail.length === 0) return;
    if (!avail.includes(time)) {
      queueMicrotask(() => onTimeChange(avail[0]!));
    }
  }, [date, time, onTimeChange, slotClock]);

  const visibleSlots = showAllSlots ? availableSlots : availableSlots.slice(0, 3);

  const { refs, floatingStyles, context } = useFloating({
    open: dateOpen,
    onOpenChange: setDateOpen,
    placement: "bottom-start",
    middleware: [offset(DATE_TRIGGER_PANEL_GAP), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const selectedDay = useMemo(() => parseBookingDay(date), [date]);
  const onDaySelect = useCallback(
    (d: Date | undefined) => {
      if (!d) return;
      onDateChange(format(d, "yyyy-MM-dd"));
      setDateOpen(false);
    },
    [onDateChange],
  );

  const dpClassNames = useMemo(() => dayPickerClassNames(), []);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
      <div className={cn("flex shrink-0 flex-col gap-1.5", DATE_TRIGGER_WIDTH_CLASS)}>
        <span id={labelId} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Date
        </span>
        <button
          ref={refs.setReference}
          type="button"
          id={triggerDomId}
          aria-haspopup="dialog"
          aria-expanded={dateOpen}
          aria-labelledby={labelId}
          className={cn(
            "relative flex h-12 w-full items-center rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-3 pr-10 text-left text-sm font-medium text-zinc-900 shadow-sm transition-[border-color,box-shadow,background-color] hover:border-emerald-400/70 hover:bg-emerald-50/70 hover:shadow-md focus-visible:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-emerald-500 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-zinc-100 dark:hover:border-emerald-600/55 dark:hover:bg-emerald-950/40",
          )}
          {...getReferenceProps()}
        >
          <span className="truncate">{formatBookingDayButtonLabel(date)}</span>
          <Calendar
            className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-emerald-700 dark:text-emerald-400/90"
            aria-hidden
          />
        </button>

        {dateOpen ? (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className={cn(
                "z-[100] rounded-xl border border-zinc-200/95 bg-white p-3 shadow-xl ring-1 ring-emerald-500/15 dark:border-zinc-600 dark:bg-zinc-900 dark:ring-emerald-400/10",
              )}
              {...getFloatingProps()}
            >
              <DayPicker
                key={date}
                mode="single"
                selected={selectedDay}
                onSelect={onDaySelect}
                defaultMonth={selectedDay}
                disabled={{ before: parseBookingDay(minDay) }}
                showOutsideDays
                classNames={dpClassNames}
              />
            </div>
          </FloatingPortal>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Time</span>
        {availableSlots.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No morning slots left for this date. Pick tomorrow or another day.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Available time slots">
            {visibleSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                aria-pressed={time === slot}
                onClick={() => onTimeChange(slot)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium tabular-nums transition",
                  time === slot
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600"
                    : "border-emerald-200/80 bg-white text-zinc-800 hover:border-emerald-500 dark:border-emerald-800/60 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-emerald-500",
                )}
              >
                {slot}
              </button>
            ))}

            {!showAllSlots && availableSlots.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllSlots(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-emerald-500 hover:text-emerald-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
              >
                More
                <ChevronDown className="size-4" aria-hidden />
              </button>
            ) : null}

            {showAllSlots && availableSlots.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllSlots(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-emerald-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-500"
              >
                Less
                <ChevronUp className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
