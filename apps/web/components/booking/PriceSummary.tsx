"use client";

import { useMemo } from "react";
import { BookingSelectedExtrasList, type SelectedExtraRow } from "@/components/booking/BookingSelectedExtrasList";
import { cn } from "@/lib/utils";

const EXTRA_LABELS: Record<string, string> = {
  "inside-fridge": "Fridge cleaning",
  "inside-oven": "Oven cleaning",
  "interior-windows": "Window cleaning",
};

export type PriceSummaryProps = {
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  /** Labels and optional per-extra ZAR from catalog snapshot (preferred over slug fallback). */
  extrasRows?: SelectedExtraRow[];
  onRemoveExtra?: (id: string) => void;
  total: number;
  loading?: boolean;
  /** Merged onto the root surface (e.g. embed inside {@link PriceSummaryCard}). */
  className?: string;
};

function formatZar(n: number): string {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

export function PriceSummary({
  bedrooms,
  bathrooms,
  extraRooms,
  extras,
  extrasRows,
  onRemoveExtra,
  total,
  loading,
  className,
}: PriceSummaryProps) {
  const extrasListItems: SelectedExtraRow[] = useMemo(() => {
    if (extrasRows !== undefined) return extrasRows;
    return extras.map((id) => ({
      id,
      label: EXTRA_LABELS[id] ?? id.replace(/-/g, " "),
      priceZar: undefined,
    }));
  }, [extras, extrasRows]);

  return (
    <div
      role="region"
      aria-label="Price quote"
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-4 shadow-md dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your quote</p>
      <ul className="mt-3 space-y-2 text-sm text-zinc-800 dark:text-zinc-200">
        <li>
          {bedrooms} Bedroom{bedrooms === 1 ? "" : "s"}
        </li>
        <li>
          {bathrooms} Bathroom{bathrooms === 1 ? "" : "s"}
        </li>
        <li>
          {extraRooms} Extra room{extraRooms === 1 ? "" : "s"}
        </li>
        <li className="list-none">
          <BookingSelectedExtrasList items={extrasListItems} onRemove={onRemoveExtra} />
        </li>
      </ul>
      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
        <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {loading ? "…" : formatZar(total)}
        </p>
      </div>
    </div>
  );
}
