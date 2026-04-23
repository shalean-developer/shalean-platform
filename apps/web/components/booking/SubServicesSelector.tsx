"use client";

import { BedDouble, BrushCleaning, House, Sparkles, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { cn } from "@/lib/utils";

type Option = {
  id: BookingServiceTypeKey;
  title: string;
  /** Shorter label on small screens (4-column row). */
  titleMobile?: string;
  subtitle: string;
  Icon: LucideIcon;
};

const OPTIONS: Option[] = [
  { id: "standard_cleaning", title: "Standard", titleMobile: "Std", subtitle: "General upkeep", Icon: House },
  { id: "airbnb_cleaning", title: "Airbnb", titleMobile: "Air", subtitle: "Guest-ready", Icon: BedDouble },
  { id: "deep_cleaning", title: "Deep", subtitle: "Top-to-bottom", Icon: Sparkles },
  { id: "move_cleaning", title: "Move In / Out", titleMobile: "Move", subtitle: "Moving clean", Icon: BrushCleaning },
  { id: "carpet_cleaning", title: "Carpet", subtitle: "Carpet care", Icon: Waves },
];

export function SubServicesSelector({
  selectedService,
  onSelect,
}: {
  selectedService: BookingServiceTypeKey | null;
  onSelect: (next: BookingServiceTypeKey) => void;
}) {
  const count = OPTIONS.length;

  return (
    <div className="grid min-w-0 grid-cols-4 gap-2 overflow-x-hidden lg:grid-cols-5 lg:gap-3">
      {OPTIONS.map(({ id, title, titleMobile, subtitle, Icon }, index) => {
        const active = selectedService === id;
        const isLastRemainder = index === count - 1 && count % 4 !== 0;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center border text-center transition",
              "max-lg:min-h-[70px] max-lg:rounded-lg max-lg:px-1 max-lg:py-2 max-lg:text-[11px] max-lg:font-medium max-lg:leading-tight",
              "lg:min-h-[104px] lg:rounded-xl lg:px-3 lg:py-4 lg:text-sm lg:font-semibold",
              isLastRemainder && "max-lg:col-span-4 max-lg:mx-auto max-lg:max-w-[140px] max-lg:w-full",
              active
                ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-600/10 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                : "border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
            )}
          >
            <Icon
              className={cn(
                "shrink-0 max-lg:mb-1 max-lg:h-6 max-lg:w-6 lg:mb-2 lg:h-6 lg:w-6",
                active ? "text-blue-700 dark:text-blue-200" : "text-zinc-600 dark:text-zinc-300",
              )}
              aria-hidden
            />
            <span className="max-w-full truncate lg:hidden">{titleMobile ?? title}</span>
            <span className="hidden max-w-full truncate lg:inline">{title}</span>
            <span className="mt-0.5 hidden text-xs text-zinc-500 dark:text-zinc-400 lg:inline">{subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
