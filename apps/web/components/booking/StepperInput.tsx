"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type StepperInputProps = {
  label: string;
  /** Secondary line under the label */
  description?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function StepperInput({
  label,
  description,
  hint,
  value,
  min,
  max,
  onChange,
}: StepperInputProps) {
  const subline = description ?? hint;
  const [bump, setBump] = useState(false);
  const firstValue = useRef(true);

  useEffect(() => {
    if (firstValue.current) {
      firstValue.current = false;
      return;
    }
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 220);
    return () => window.clearTimeout(t);
  }, [value]);

  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const btnBase =
    "flex shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white font-medium leading-none text-zinc-700 transition-[transform,opacity,background-color,border-color] duration-150 ease-out enabled:hover:border-zinc-300 enabled:hover:bg-zinc-50 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:enabled:hover:border-zinc-600 dark:enabled:hover:bg-zinc-900";

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col border border-zinc-200/80 bg-white transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        /* Mobile: vertical stack — label, value, then − + only (fits narrow grid cells) */
        "max-lg:min-h-[100px] max-lg:items-center max-lg:justify-center max-lg:rounded-xl max-lg:px-2 max-lg:py-3",
        /* Desktop: original card */
        "lg:min-h-[120px] lg:justify-between lg:gap-4 lg:rounded-2xl lg:p-4",
      )}
    >
      {/* Mobile: stacked */}
      <div className="flex w-full flex-col items-center justify-center text-center lg:hidden">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
        <div
          className={cn(
            "mt-1 text-base font-semibold tabular-nums text-zinc-900 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:text-zinc-50",
            bump ? "scale-110" : "scale-100",
          )}
          aria-live="polite"
        >
          {value}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={dec}
            disabled={value <= min}
            aria-label={`Decrease ${label}`}
            className={cn(btnBase, "h-7 w-7 text-sm")}
          >
            −
          </button>
          <button
            type="button"
            onClick={inc}
            disabled={value >= max}
            aria-label={`Increase ${label}`}
            className={cn(btnBase, "h-7 w-7 text-sm")}
          >
            +
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden w-full lg:block">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        {subline ? (
          <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{subline}</p>
        ) : null}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={dec}
            disabled={value <= min}
            aria-label={`Decrease ${label}`}
            className={cn(btnBase, "h-9 w-9 text-lg")}
          >
            −
          </button>
          <span
            className={cn(
              "inline-flex min-w-[1.75rem] select-none items-center justify-center text-center text-base font-semibold tabular-nums text-zinc-900 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:text-zinc-50",
              bump ? "scale-110" : "scale-100",
            )}
            aria-live="polite"
          >
            {value}
          </span>
          <button
            type="button"
            onClick={inc}
            disabled={value >= max}
            aria-label={`Increase ${label}`}
            className={cn(btnBase, "h-9 w-9 text-lg")}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
