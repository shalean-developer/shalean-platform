"use client";

import { AppWindow, Boxes, BrickWall, Microwave, Refrigerator, Sprout } from "lucide-react";
import { useMemo } from "react";
import { BOOKING_OPTIONAL_EXTRAS_CATALOG, type BookingOptionalExtraDef, type BookingOptionalExtraIconKey } from "@/lib/booking/optionalExtrasCatalog";
import { cn } from "@/lib/utils";

const ICONS: Record<BookingOptionalExtraIconKey, typeof Refrigerator> = {
  fridge: Refrigerator,
  oven: Microwave,
  cabinets: Boxes,
  windows: AppWindow,
  walls: BrickWall,
  plants: Sprout,
};

function ExtraTaskItem({
  extra,
  selected,
  onToggle,
}: {
  extra: BookingOptionalExtraDef;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = ICONS[extra.iconKey];

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={extra.name}
      onClick={onToggle}
      className={cn(
        "group flex min-w-[4.5rem] max-w-[6.5rem] flex-col items-center gap-2 rounded-xl p-2 transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
      )}
    >
      <span
        className={cn(
          "flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-emerald-800 bg-white transition-colors dark:border-emerald-600 dark:bg-zinc-950",
          selected
            ? "border-emerald-800 bg-emerald-800 text-white dark:border-emerald-500 dark:bg-emerald-700"
            : "text-emerald-800 group-hover:border-emerald-600 group-hover:bg-emerald-50/80 dark:text-emerald-400 dark:group-hover:bg-emerald-950/40",
        )}
        aria-hidden
      >
        <Icon className="size-7" strokeWidth={1.5} />
      </span>
      <span className="text-center text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-200">{extra.name}</span>
    </button>
  );
}

export type BookingOptionalExtrasSectionProps = {
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  className?: string;
};

export function BookingOptionalExtrasSection({ selectedIds, onToggle, className }: BookingOptionalExtrasSectionProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="extra-tasks-heading">
      <h2 id="extra-tasks-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Extra Tasks
      </h2>

      <div className="grid grid-cols-3 gap-x-2 gap-y-6 sm:gap-x-4 md:grid-cols-6">
        {BOOKING_OPTIONAL_EXTRAS_CATALOG.map((ex) => (
          <ExtraTaskItem
            key={ex.id}
            extra={ex}
            selected={selectedSet.has(ex.id)}
            onToggle={() => onToggle(ex.id)}
          />
        ))}
      </div>
    </section>
  );
}
