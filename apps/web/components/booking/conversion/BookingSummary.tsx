"use client";

import type { ConversionBookingFormState } from "@/components/booking/conversion/conversionBookingTypes";
import { widgetServiceLabel } from "@/lib/booking/widgetServiceGroups";
import { cn } from "@/lib/utils";

const EXTRA_LABEL: Record<string, string> = {
  fridge: "Inside Fridge",
  oven: "Inside Oven",
  cabinets: "Inside Cabinets",
  windows: "Interior Windows",
  walls: "Interior Walls",
  plants: "Water Plants",
};

export type BookingSummaryProps = {
  form: ConversionBookingFormState;
  isLocked: boolean;
  /** Desktop sidebar vs mobile dock */
  variant: "sidebar" | "mobileDock";
  /** Date & time came from the homepage widget — user edits them only if they return to change flow. */
  schedulePrefilledFromHome?: boolean;
};

function formatDate(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  if (!y || !mo || !d) return ymd;
  return new Date(y, mo - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingSummary({
  form,
  isLocked,
  variant,
  schedulePrefilledFromHome = false,
}: BookingSummaryProps) {
  const extrasLine =
    form.extras.length === 0
      ? "None"
      : form.extras.map((id) => EXTRA_LABEL[id] ?? id).join(", ");

  const inner = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your booking</h2>
        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{widgetServiceLabel(form.service)}</p>
      </div>
      <dl className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-zinc-400">Bedrooms / baths</dt>
          <dd className="font-medium tabular-nums">
            {form.bedrooms} / {form.bathrooms}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-zinc-400">Extra rooms</dt>
          <dd className="font-medium tabular-nums">{form.extraRooms >= 5 ? "5+" : form.extraRooms}</dd>
        </div>
        {form.serviceAreaName.trim() ? (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500 dark:text-zinc-400">Service area</dt>
            <dd className="max-w-[55%] text-right text-xs font-medium leading-snug">{form.serviceAreaName.trim()}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-zinc-400">Date &amp; time</dt>
          <dd className="text-right font-medium">
            {formatDate(form.date)}
            <br />
            <span className="tabular-nums">{form.time}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 dark:text-zinc-400">Extras</dt>
          <dd className="max-w-[55%] text-right text-xs font-medium leading-snug">{extrasLine}</dd>
        </div>
      </dl>
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div className="flex items-end justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Total</span>
          <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {form.price != null ? `R${form.price.toLocaleString("en-ZA")}` : "—"}
          </span>
        </div>
        {isLocked ? (
          <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300/90">
            Price locked — no changes at checkout
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {schedulePrefilledFromHome
              ? "Adjust rooms or extras, then continue to lock your price."
              : "Choose date &amp; time, then continue to lock your price."}
          </p>
        )}
      </div>
    </div>
  );

  if (variant === "sidebar") {
    return (
      <aside
        className={cn(
          "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
          "lg:sticky lg:top-24 lg:self-start",
        )}
      >
        {inner}
      </aside>
    );
  }

  return (
    <div className="rounded-t-2xl border border-b-0 border-zinc-200 bg-white px-4 pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40">
      <div className="max-h-[40vh] overflow-y-auto overscroll-contain">{inner}</div>
    </div>
  );
}
