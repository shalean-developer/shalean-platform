"use client";

import { useMemo, useState } from "react";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { clampTipZar } from "@/lib/payments/bookingPaymentSummary";
import { cn } from "@/lib/utils";

const PRESETS = [0, 25, 50, 100, 150] as const;

function initials(name: string): string {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

type TipSelectorProps = {
  summary: Pick<BookingPaymentSummary, "cleanerName">;
  tipZar: number;
  onTipZarChange: (zar: number) => void;
};

export function TipSelector({ summary, tipZar, onTipZarChange }: TipSelectorProps) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [customDraft, setCustomDraft] = useState("");
  const cleanerLabel = summary.cleanerName?.trim() || "your cleaner";

  const isCustomActive = useMemo(() => mode === "custom" || !PRESETS.includes(tipZar as (typeof PRESETS)[number]), [mode, tipZar]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
          {initials(cleanerLabel)}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">Add a tip for</p>
          <p className="text-lg font-bold text-gray-900 dark:text-zinc-50">{cleanerLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex w-full min-w-0 flex-nowrap items-stretch gap-1.5">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => {
              setMode("preset");
              onTipZarChange(amt);
            }}
            className={cn(
              "min-h-10 min-w-0 flex-1 basis-0 rounded-full border px-1 py-2 text-center text-xs font-semibold transition-all duration-200 sm:min-h-11 sm:px-2 sm:text-sm",
              tipZar === amt && mode === "preset"
                ? "border-blue-600 bg-blue-600 font-bold text-white dark:border-blue-500 dark:bg-blue-600"
                : "border-gray-200 bg-white text-gray-900 hover:border-gray-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500",
            )}
          >
            R{amt}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setMode("custom");
            setCustomDraft(tipZar > 0 && !PRESETS.includes(tipZar as (typeof PRESETS)[number]) ? String(tipZar) : "");
          }}
          className={cn(
            "min-h-10 min-w-0 flex-1 basis-0 rounded-full border px-1 py-2 text-center text-xs font-bold transition-all duration-200 sm:min-h-11 sm:px-2 sm:text-sm",
            isCustomActive
              ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
              : "border-gray-200 bg-white text-gray-900 hover:border-gray-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500",
          )}
        >
          Custom
        </button>
      </div>

      {isCustomActive ? (
        <div className="mt-3">
          <label htmlFor="tip-custom" className="sr-only">
            Custom tip amount (ZAR)
          </label>
          <input
            id="tip-custom"
            inputMode="numeric"
            placeholder="Amount in Rands"
            value={customDraft}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setCustomDraft(v);
              const n = v === "" ? 0 : Number(v);
              if (Number.isFinite(n)) onTipZarChange(clampTipZar(n));
            }}
            className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </div>
      ) : null}
    </div>
  );
}
