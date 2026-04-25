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
  {
    id: "standard_cleaning",
    title: "Standard",
    subtitle: "Everyday home upkeep",
    Icon: House,
  },
  {
    id: "airbnb_cleaning",
    title: "Airbnb",
    subtitle: "Fast guest turnovers",
    Icon: BedDouble,
  },
  {
    id: "deep_cleaning",
    title: "Deep",
    subtitle: "Top-to-bottom detail",
    Icon: Sparkles,
  },
  {
    id: "move_cleaning",
    title: "Move in/out",
    subtitle: "Empty home make-ready",
    Icon: BrushCleaning,
  },
  {
    id: "carpet_cleaning",
    title: "Carpet",
    subtitle: "Deep fabric refresh",
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
  /** Marketing-only: dynamic pricing can vary by time — not a live savings calculation. */
  showPricingSaveSignal = true,
  /** When set, that option shows a “High demand” badge instead of the save signal. */
  highDemandServiceId = null,
}: {
  selectedService: BookingServiceTypeKey | null;
  onSelect: (next: BookingServiceTypeKey) => void;
  popularId?: BookingServiceTypeKey;
  popularLabel?: string;
  /** Set to `null` to hide the secondary “Recommended” pill. */
  recommendedId?: BookingServiceTypeKey | null;
  recommendedLabel?: string;
  showPricingSaveSignal?: boolean;
  highDemandServiceId?: BookingServiceTypeKey | null;
}) {
  const count = OPTIONS.length;

  return (
    <div className="grid min-w-0 grid-cols-4 gap-2 pt-2.5 lg:grid-cols-5 lg:gap-3 lg:pt-3">
      {OPTIONS.map(({ id, title, subtitle, Icon }, index) => {
        const active = selectedService === id;
        const isLastRemainder = index === count - 1 && count % 4 !== 0;
        const isPopular = id === popularId;
        const isRecommended = recommendedId != null && id === recommendedId;
        const hasBadge = isPopular || isRecommended;
        const showHighDemand = highDemandServiceId === id;
        const showSavePill = showPricingSaveSignal && !showHighDemand;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex min-w-0 flex-col items-center justify-center border text-center transition",
              "max-lg:min-h-[78px] max-lg:rounded-lg max-lg:px-1 max-lg:pb-2 max-lg:text-[11px] max-lg:font-medium max-lg:leading-tight",
              "lg:min-h-[120px] lg:rounded-xl lg:px-3 lg:pb-3 lg:text-sm lg:font-semibold",
              hasBadge ? "max-lg:pt-5 lg:pt-6" : "max-lg:pt-4 lg:pt-4",
              isLastRemainder && "max-lg:col-span-4 max-lg:mx-auto max-lg:max-w-[140px] max-lg:w-full",
              active
                ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-600/10 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                : "border-zinc-200/90 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-900/60",
            )}
          >
            {isPopular ? (
              <span className="absolute left-1/2 top-0 z-10 max-w-[calc(100%-0.25rem)] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-amber-200/80 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/90 dark:text-amber-100 lg:px-2 lg:text-[10px]">
                ★ {popularLabel}
              </span>
            ) : isRecommended ? (
              <span className="absolute left-1/2 top-0 z-10 max-w-[calc(100%-0.25rem)] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-sky-200/80 bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-950 shadow-sm dark:border-sky-800/60 dark:bg-sky-950/90 dark:text-sky-100 lg:px-2 lg:text-[10px]">
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
            <span className="max-w-full truncate">{title}</span>
            <span className="mt-0.5 hidden max-w-full text-xs font-normal leading-snug text-zinc-500 dark:text-zinc-400 lg:inline">{subtitle}</span>
            {showSavePill ? (
              <span className="mt-1.5 max-w-full truncate rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 lg:mt-2 lg:px-2 lg:text-[9px]">
                Save up to 15%
              </span>
            ) : showHighDemand ? (
              <span className="mt-1.5 max-w-full truncate rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 lg:mt-2 lg:px-2 lg:text-[9px]">
                High demand
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
