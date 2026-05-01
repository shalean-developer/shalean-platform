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
};

export function ScheduleDateScroller({ value, onChange, unavailableDates }: ScheduleDateScrollerProps) {
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Date</h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-220)}
            disabled={!canScrollLeft}
            aria-label="Scroll dates left"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-700 transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scrollBy(220)}
            disabled={!canScrollRight}
            aria-label="Scroll dates right"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-700 transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            →
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-2 sm:gap-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((d) => {
          const disabled = d.isPast || d.unavailable;
          const isSelected = value === d.value;
          if (disabled) {
            return (
              <div
                key={d.value}
                className="flex min-h-[56px] min-w-[64px] shrink-0 snap-center flex-col items-center rounded-xl border border-zinc-100 bg-zinc-50 px-2 py-2 text-sm opacity-45 dark:border-zinc-800 dark:bg-zinc-900/50"
                aria-disabled
              >
                <span className="text-xs text-zinc-400">{d.dayLabel}</span>
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
                "flex min-h-[56px] min-w-[64px] shrink-0 snap-center flex-col items-center rounded-xl border px-2 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:min-w-[72px] sm:px-3 dark:focus-visible:ring-blue-400/35",
                isSelected
                  ? "border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-100"
                  : "border-gray-200 bg-white text-zinc-900 hover:border-gray-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500",
              )}
            >
              <span className="text-xs">{d.dayLabel}</span>
              <span className="text-base font-semibold">{d.dateNum}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
