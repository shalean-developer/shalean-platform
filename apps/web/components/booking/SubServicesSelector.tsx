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
  {
    id: "standard_cleaning",
    title: "Standard Cleaning",
    titleMobile: "Standard",
    subtitle: "Regular home cleaning & upkeep",
    Icon: House,
  },
  {
    id: "airbnb_cleaning",
    title: "Airbnb Cleaning",
    titleMobile: "Airbnb",
    subtitle: "Quick turnover between guests",
    Icon: BedDouble,
  },
  {
    id: "deep_cleaning",
    title: "Deep Cleaning",
    titleMobile: "Deep",
    subtitle: "Thorough, detailed cleaning",
    Icon: Sparkles,
  },
  {
    id: "move_cleaning",
    title: "Move In / Move Out Cleaning",
    titleMobile: "Move",
    subtitle: "Perfect for empty properties",
    Icon: BrushCleaning,
  },
  {
    id: "carpet_cleaning",
    title: "Carpet Cleaning",
    titleMobile: "Carpet",
    subtitle: "Professional carpet refresh",
    Icon: Waves,
  },
];

export function SubServicesSelector({
  selectedService,
  onSelect,
  popularId = "standard_cleaning",
  popularLabel = "Most popular",
  recommendedId = "deep_cleaning",
  recommendedLabel = "Recommended",
}: {
  selectedService: BookingServiceTypeKey | null;
  onSelect: (next: BookingServiceTypeKey) => void;
  popularId?: BookingServiceTypeKey;
  popularLabel?: string;
  /** Set to `null` to hide the secondary “Recommended” pill (e.g. Deep Cleaning). */
  recommendedId?: BookingServiceTypeKey | null;
  recommendedLabel?: string;
}) {
  const count = OPTIONS.length;

  return (
    <div className="grid min-w-0 grid-cols-4 gap-2 overflow-x-hidden lg:grid-cols-5 lg:gap-3">
      {OPTIONS.map(({ id, title, titleMobile, subtitle, Icon }, index) => {
        const active = selectedService === id;
        const isLastRemainder = index === count - 1 && count % 4 !== 0;
        const isPopular = id === popularId;
        const isRecommended = recommendedId != null && id === recommendedId;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex min-w-0 flex-col items-center justify-center border text-center transition",
              "max-lg:min-h-[78px] max-lg:rounded-lg max-lg:px-1 max-lg:pb-2 max-lg:pt-4 max-lg:text-[11px] max-lg:font-medium max-lg:leading-tight",
              "lg:min-h-[112px] lg:rounded-xl lg:px-3 lg:py-4 lg:text-sm lg:font-semibold",
              isLastRemainder && "max-lg:col-span-4 max-lg:mx-auto max-lg:max-w-[140px] max-lg:w-full",
              active
                ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-600/10 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                : "border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
            )}
          >
            {isPopular ? (
              <span className="absolute left-1/2 top-1 max-w-[calc(100%-0.5rem)] -translate-x-1/2 truncate rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-950/80 dark:text-amber-100 lg:top-1.5 lg:px-2 lg:text-[10px]">
                ★ {popularLabel}
              </span>
            ) : isRecommended ? (
              <span className="absolute left-1/2 top-1 max-w-[calc(100%-0.5rem)] -translate-x-1/2 truncate rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-950 dark:bg-sky-950/80 dark:text-sky-100 lg:top-1.5 lg:px-2 lg:text-[10px]">
                {recommendedLabel}
              </span>
            ) : null}
            <Icon
              className={cn(
                "shrink-0 max-lg:mb-0.5 max-lg:h-5 max-lg:w-5 lg:mb-2 lg:h-6 lg:w-6",
                active ? "text-blue-700 dark:text-blue-200" : "text-zinc-600 dark:text-zinc-300",
              )}
              aria-hidden
            />
            <span className="max-w-full truncate lg:hidden">{titleMobile ?? title}</span>
            <span className="hidden max-w-full truncate lg:inline">{title}</span>
            <span className="mt-0.5 hidden text-xs font-normal text-zinc-500 dark:text-zinc-400 lg:inline">{subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
