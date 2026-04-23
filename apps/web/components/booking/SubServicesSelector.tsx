"use client";

import { BedDouble, BrushCleaning, House, Sparkles, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { cn } from "@/lib/utils";

type Option = {
  id: BookingServiceTypeKey;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
};

const OPTIONS: Option[] = [
  { id: "standard_cleaning", title: "Standard", subtitle: "General upkeep", Icon: House },
  { id: "airbnb_cleaning", title: "Airbnb", subtitle: "Guest-ready", Icon: BedDouble },
  { id: "deep_cleaning", title: "Deep", subtitle: "Top-to-bottom", Icon: Sparkles },
  { id: "move_cleaning", title: "Move In / Out", subtitle: "Moving clean", Icon: BrushCleaning },
  { id: "carpet_cleaning", title: "Carpet", subtitle: "Carpet care", Icon: Waves },
];

export function SubServicesSelector({
  selectedService,
  onSelect,
}: {
  selectedService: BookingServiceTypeKey | null;
  onSelect: (next: BookingServiceTypeKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {OPTIONS.map(({ id, title, subtitle, Icon }) => {
        const active = selectedService === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "min-h-[116px] rounded-xl border px-3 py-4 text-center transition",
              "flex flex-col items-center justify-center gap-1.5",
              active
                ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-blue-600" : "text-zinc-500")} aria-hidden />
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
