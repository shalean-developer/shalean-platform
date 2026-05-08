"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ScheduleDateChip = {
  value: string;
  dayLabel: string;
  dateNum: number;
  isPast: boolean;
  /** Hook for calendar / capacity — hide when true */
  unavailable: boolean;
};

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Rolling calendar from today through `daysAhead` (inclusive of today). */
export function generateScheduleDateRange(daysAhead: number, unavailableDates?: ReadonlySet<string>): ScheduleDateChip[] {
  const start = startOfToday();
  const out: ScheduleDateChip[] = [];
  const unavail = unavailableDates ?? new Set<string>();

  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const value = formatLocalYmd(d);
    const isPast = d < start;
    out.push({
      value,
      dayLabel: d.toLocaleDateString("en-ZA", { weekday: "short" }),
      dateNum: d.getDate(),
      isPast,
      unavailable: unavail.has(value),
    });
  }
  return out;
}

type ScheduleDateScrollerProps = {
  value: string | null;
  onChange: (ymd: string | null) => void;
  /** YYYY-MM-DD set of blocked days (optional). */
  unavailableDates?: ReadonlySet<string>;
  variant?: "default" | "checkout";
  ariaScrollLeft?: string;
  ariaScrollRight?: string;
  /** When set (e.g. “Pick a date”), shown on the same row as the scroll arrows. */
  sectionLabel?: string;
};

export function ScheduleDateScroller({
  value,
  onChange,
  unavailableDates,
  variant = "default",
  ariaScrollLeft = "Scroll dates left",
  ariaScrollRight = "Scroll dates right",
  sectionLabel,
}: ScheduleDateScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const chips = useMemo(() => generateScheduleDateRange(90, unavailableDates), [unavailableDates]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    handleScroll();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => handleScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [handleScroll, chips.length]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const checkout = variant === "checkout";
  const hasSectionLabel = Boolean(sectionLabel?.trim());
  const headingId = "booking-schedule-date-heading";

  return (
    <div>
      <div
        className={cn(
          "flex min-h-[2rem] items-center gap-2",
          hasSectionLabel
            ? "mb-2 justify-between"
            : checkout
              ? "hidden justify-end sm:mb-2 sm:flex"
              : "mb-3 justify-end",
        )}
      >
        {hasSectionLabel ? (
          <h2
            id={headingId}
            className="min-w-0 flex-1 pr-2 text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100"
          >
            {sectionLabel}
          </h2>
        ) : null}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-220)}
            disabled={!canScrollLeft}
            aria-label={ariaScrollLeft}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-700 transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scrollBy(220)}
            disabled={!canScrollRight}
            aria-label={ariaScrollRight}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-700 transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            →
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="region"
        aria-labelledby={hasSectionLabel ? headingId : undefined}
        className={cn(
          "scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          checkout ? "gap-2 sm:gap-2.5 sm:pb-2" : "pb-2 sm:gap-3",
        )}
      >
        {chips.map((d) => {
          const disabled = d.isPast || d.unavailable;
          const isSelected = value === d.value;
          if (disabled) {
            return (
              <div
                key={d.value}
                className={cn(
                  "flex shrink-0 snap-center flex-col items-center rounded-xl border px-2 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40",
                  checkout
                    ? "min-h-[58px] min-w-[64px] border-zinc-100 bg-zinc-50/90 opacity-[0.52] dark:opacity-50 sm:min-w-[72px]"
                    : "min-h-[56px] min-w-[64px] border-zinc-100 bg-zinc-50 opacity-45 dark:bg-zinc-900/50",
                )}
                aria-disabled
              >
                <span className={cn("text-xs", checkout ? "text-zinc-400" : "text-zinc-400")}>{d.dayLabel}</span>
                <span className="text-base font-semibold text-zinc-400">{d.dateNum}</span>
              </div>
            );
          }
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => onChange(d.value)}
              className={cn(
                "flex shrink-0 snap-center flex-col items-center rounded-xl border px-2 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:focus-visible:ring-blue-400/35",
                checkout
                  ? "min-h-[58px] min-w-[64px] sm:min-w-[72px] sm:px-3"
                  : "min-h-[56px] min-w-[64px] sm:min-w-[72px] sm:px-3",
                isSelected
                  ? checkout
                    ? "border-blue-600 bg-white font-semibold text-blue-700 shadow-sm ring-1 ring-blue-600/15 dark:border-blue-500 dark:bg-zinc-950 dark:text-blue-400 dark:ring-blue-500/25"
                    : "border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-100"
                  : checkout
                    ? "border-zinc-200/90 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500"
                    : "border-gray-200 bg-white text-zinc-900 hover:border-gray-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500",
              )}
            >
              <span className={cn("text-xs", isSelected && checkout && "text-blue-700 dark:text-blue-400")}>
                {d.dayLabel}
              </span>
              <span className={cn("text-base font-semibold", isSelected && checkout && "text-blue-700 dark:text-blue-400")}>
                {d.dateNum}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
