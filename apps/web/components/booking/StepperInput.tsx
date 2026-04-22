"use client";

import { useEffect, useRef, useState } from "react";

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

  return (
    <div
      className={[
        "flex h-full min-h-[120px] flex-col justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4",
        "transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
      ].join(" ")}
    >
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        {subline ? (
          <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{subline}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg font-medium leading-none text-zinc-700 transition-[transform,opacity,background-color,border-color] duration-150 ease-out enabled:hover:border-zinc-300 enabled:hover:bg-zinc-50 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:enabled:hover:border-zinc-600 dark:enabled:hover:bg-zinc-900"
        >
          −
        </button>
        <span
          className={[
            "inline-flex min-w-[1.75rem] select-none items-center justify-center text-center text-base font-semibold tabular-nums text-zinc-900 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:text-zinc-50",
            bump ? "scale-110" : "scale-100",
          ].join(" ")}
          aria-live="polite"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg font-medium leading-none text-zinc-700 transition-[transform,opacity,background-color,border-color] duration-150 ease-out enabled:hover:border-zinc-300 enabled:hover:bg-zinc-50 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:enabled:hover:border-zinc-600 dark:enabled:hover:bg-zinc-900"
        >
          +
        </button>
      </div>
    </div>
  );
}
