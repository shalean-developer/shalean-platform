"use client";

import { useEffect, useMemo, useState } from "react";

/** Days ahead available for booking (paged, 7 per view). */
export const BOOKING_CALENDAR_DAYS = 30;

export type BookingDateItem = { value: string };

function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next `count` calendar days starting from today (local), as `{ value: YYYY-MM-DD }`. */
export function generateNextDates(count: number): BookingDateItem[] {
  const out: BookingDateItem[] = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ value: formatLocalYMD(d) });
  }
  return out;
}

/** @deprecated Use `generateNextDates` for the full list + `BookingDateSelector` for UI. */
export function getBookingDateOptions(count: number): string[] {
  return generateNextDates(count).map((d) => d.value);
}

function shortDayLabel(ymd: string): { line1: string; line2: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const line1 = date.toLocaleDateString("en-ZA", { weekday: "short" });
  const line2 = date.toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
  return { line1, line2 };
}

function DateCard({
  date,
  selected,
  onSelect,
}: {
  date: BookingDateItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { line1, line2 } = shortDayLabel(date.value);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex min-h-[4.25rem] w-full min-w-0 flex-col rounded-xl border px-2 py-2.5 text-center transition-all duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        selected
          ? "border-primary bg-primary/5 text-zinc-950 shadow-sm dark:border-primary dark:bg-primary/15 dark:text-zinc-50"
          : "border-zinc-200/90 bg-white text-zinc-800 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600",
      ].join(" ")}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{line1}</span>
      <span className="text-sm font-bold tabular-nums">{line2}</span>
    </button>
  );
}

type BookingDateSelectorProps = {
  selected: string;
  onSelect: (ymd: string) => void;
};

/**
 * Shows exactly 7 dates with prev/next paging (no horizontal scroll).
 */
export function BookingDateSelector({ selected, onSelect }: BookingDateSelectorProps) {
  const allDates = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS), []);
  const [startIndex, setStartIndex] = useState(0);

  // Align the visible week when `selected` changes (e.g. returning with a locked date).
  useEffect(() => {
    const index = allDates.findIndex((d) => d.value === selected);
    if (index < 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync paging window to `selected` when it changes externally
    setStartIndex(Math.floor(index / 7) * 7);
  }, [selected, allDates]);

  const visibleDates = allDates.slice(startIndex, startIndex + 7);
  const canGoBack = startIndex > 0;
  const canGoForward = startIndex + 7 < allDates.length;

  function handlePrev() {
    if (!canGoBack) return;
    setStartIndex((prev) => prev - 7);
  }

  function handleNext() {
    if (!canGoForward) return;
    setStartIndex((prev) => prev + 7);
  }

  return (
    <div className="flex min-w-0 items-center gap-2 transition-all duration-200">
      <button
        type="button"
        aria-label="Previous week"
        onClick={handlePrev}
        disabled={!canGoBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-sm font-medium text-zinc-800 transition-all duration-200 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        ←
      </button>

      <div className="grid min-w-0 flex-1 grid-cols-7 gap-2 overflow-hidden transition-all duration-200">
        {visibleDates.map((date) => (
          <DateCard
            key={date.value}
            date={date}
            selected={date.value === selected}
            onSelect={() => onSelect(date.value)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Next week"
        onClick={handleNext}
        disabled={!canGoForward}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-sm font-medium text-zinc-800 transition-all duration-200 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        →
      </button>
    </div>
  );
}
