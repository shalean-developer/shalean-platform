"use client";

import { cn } from "@/lib/utils";
import { iconForAddOn } from "@/components/booking/AddOnsSelector";
import type { CatalogExtra } from "@/lib/pricing/usePricingCatalog";

type ExtrasStepProps = {
  value: string[];
  onChange: (extras: string[]) => void;
  extras: CatalogExtra[];
  loading: boolean;
};

const LABEL_BY_SLUG: Partial<Record<string, string>> = {
  "inside-fridge": "Inside Fridge",
  "inside-oven": "Inside Oven",
  "inside-cabinets": "Inside Cabinets",
  "interior-windows": "Interior Windows",
  "interior-walls": "Interior Walls",
  "water-plants": "Water Plants",
  ironing: "Ironing",
  laundry: "Laundry",
  "small-flatlet": "Small Flatlet",
};

type ExtraGridItemProps = {
  id: string;
  label: string;
  selected: boolean;
  onToggle: (id: string) => void;
};

function ExtraGridItem({ id, label, selected, onToggle }: ExtraGridItemProps) {
  const Icon = iconForAddOn(id);

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-pressed={selected}
      aria-label={label}
      className="group flex min-h-[44px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:focus-visible:ring-blue-400/35"
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-blue-500 text-blue-600 transition-all sm:h-14 sm:w-14 dark:border-blue-500 dark:text-blue-400",
          selected
            ? "border-blue-600 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/50"
            : "bg-white group-hover:bg-blue-50/90 dark:bg-zinc-900 dark:group-hover:bg-blue-950/35",
        )}
      >
        <Icon className="size-[18px] shrink-0 sm:size-5" aria-hidden />
      </div>
      <p className="line-clamp-2 text-[11px] leading-tight text-blue-900 sm:text-sm dark:text-blue-200">{label}</p>
    </button>
  );
}

export function ExtrasStep({ value, onChange, extras, loading }: ExtrasStepProps) {
  function toggleExtra(id: string) {
    onChange(value.includes(id) ? value.filter((e) => e !== id) : [...value, id]);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col items-center" aria-hidden>
            <div className="h-11 w-11 animate-pulse rounded-full border border-zinc-200 bg-zinc-100 sm:h-14 sm:w-14 dark:border-zinc-700 dark:bg-zinc-800" />
            <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-zinc-200 sm:mt-2 sm:h-3.5 sm:w-20 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      {extras.map((extra) => {
        const selected = value.includes(extra.id);
        const label = LABEL_BY_SLUG[extra.id] ?? extra.name;
        return (
          <ExtraGridItem
            key={extra.id}
            id={extra.id}
            label={label}
            selected={selected}
            onToggle={toggleExtra}
          />
        );
      })}
    </div>
  );
}
