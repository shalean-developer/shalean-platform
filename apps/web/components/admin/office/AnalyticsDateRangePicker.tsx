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
import { CalendarDays } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { DayPicker, getDefaultClassNames, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

export type AnalyticsRange = { from: Date; to: Date };

const PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function presetRange(days: number): AnalyticsRange {
  const to = startOfDay(new Date());
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}

function formatRangeLabel(range: AnalyticsRange): string {
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const fromLabel = format(range.from, sameYear ? "d MMM" : "d MMM yyyy");
  const toLabel = format(range.to, "d MMM yyyy");
  return `${fromLabel} – ${toLabel}`;
}

const rangeClassNames = (): Record<string, string> => {
  const base = getDefaultClassNames();
  return {
    ...base,
    root: cn(base.root, "font-sans text-slate-900"),
    months: cn(base.months, ""),
    month_caption: cn(base.month_caption, "mb-2 flex items-center justify-center text-sm font-semibold text-slate-900"),
    nav: cn(base.nav, "absolute inset-x-0 top-0 flex w-full justify-between"),
    button_previous: cn(
      base.button_previous,
      "inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    ),
    button_next: cn(
      base.button_next,
      "inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    ),
    month_grid: cn(base.month_grid, "border-collapse"),
    weekdays: cn(base.weekdays, "mb-1"),
    weekday: cn(base.weekday, "text-[11px] font-medium uppercase text-slate-400"),
    day: cn(base.day, "size-8 p-0 text-sm font-medium text-slate-700"),
    day_button: cn(base.day_button, "size-8 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50"),
    selected: cn(base.selected, "[&_button]:border-blue-600 [&_button]:bg-blue-600 [&_button]:text-white"),
    range_start: cn(base.range_start, "[&_button]:rounded-l-lg"),
    range_end: cn(base.range_end, "[&_button]:rounded-r-lg"),
    range_middle: cn(base.range_middle, "[&_button]:rounded-none [&_button]:border-blue-100 [&_button]:bg-blue-50 [&_button]:text-blue-700"),
    today: cn(base.today, "[&_button]:ring-2 [&_button]:ring-blue-400/40"),
    disabled: cn(base.disabled, "opacity-40"),
    outside: cn(base.outside, "opacity-40"),
  };
};

export function AnalyticsDateRangePicker({
  value,
  onChange,
  maxDate,
}: {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
  maxDate?: Date;
}) {
  const reactId = useId();
  const labelId = `${reactId}-range-label`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: value.from, to: value.to });

  const today = useMemo(() => startOfDay(maxDate ?? new Date()), [maxDate]);
  const dpClassNames = useMemo(() => rangeClassNames(), []);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (next) setDraft({ from: value.from, to: value.to });
    },
    placement: "bottom-end",
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const apply = useCallback(
    (range: AnalyticsRange) => {
      onChange(range);
      setDraft({ from: range.from, to: range.to });
      setOpen(false);
    },
    [onChange],
  );

  const onRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      setDraft(range);
      if (range?.from && range?.to) {
        apply({ from: startOfDay(range.from), to: startOfDay(range.to) });
      }
    },
    [apply],
  );

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        {...getReferenceProps()}
      >
        <CalendarDays className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <span id={labelId}>{formatRangeLabel(value)}</span>
      </button>

      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[100] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
            {...getFloatingProps()}
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => apply(presetRange(preset.days))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={onRangeSelect}
              defaultMonth={value.from}
              disabled={{ after: today }}
              showOutsideDays
              classNames={dpClassNames}
            />
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
