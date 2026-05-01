"use client";

import { useMemo } from "react";
import { Building, Home, Sofa, Sparkles, Truck, Zap, type LucideIcon } from "lucide-react";
import { ServiceGridCard } from "@/components/booking/ServiceGridCard";
import { formatServiceName } from "@/lib/booking/formatServiceName";
import { cn } from "@/lib/utils";

export type ServiceGridItem = {
  id: string;
  name: string;
  description: string;
  Icon: LucideIcon;
};

/** Fixed 6 services — ids align with `BookingServiceId` / pricing catalog. */
export const SERVICE_GRID_ITEMS: readonly ServiceGridItem[] = [
  {
    id: "quick",
    name: "Quick",
    description: "Fast refresh for light cleaning needs",
    Icon: Zap,
  },
  {
    id: "standard",
    name: "Standard",
    description: "Regular upkeep, done right",
    Icon: Home,
  },
  {
    id: "airbnb",
    name: "Airbnb",
    description: "Perfect for guest turnovers",
    Icon: Building,
  },
  {
    id: "deep",
    name: "Deep",
    description: "Full home reset for a thorough clean",
    Icon: Sparkles,
  },
  {
    id: "move",
    name: "Move-out",
    description: "Handover-ready cleaning for moving",
    Icon: Truck,
  },
  {
    id: "carpet",
    name: "Carpet",
    description: "Focused care for rugs and carpets",
    Icon: Sofa,
  },
] as const;

export type ServiceGridProps = {
  value: string;
  onChange: (id: string) => void;
  /** When set, only ids in this set are selectable (e.g. active catalog from API). */
  enabledIds?: ReadonlySet<string> | null;
};

export function ServiceGrid({ value, onChange, enabledIds }: ServiceGridProps) {
  const allow = useMemo(() => enabledIds ?? null, [enabledIds]);

  return (
    <>
      {/* Mobile / tablet: compact 3×2 icon grid */}
      <div
        className="grid grid-cols-3 place-items-center gap-x-4 gap-y-6 text-center lg:hidden"
        role="listbox"
        aria-label="Choose a service"
      >
        {SERVICE_GRID_ITEMS.map((item) => {
          const disabled = allow != null && !allow.has(item.id);
          const selected = value === item.id;
          const { Icon } = item;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onChange(item.id)}
              aria-label={`${item.name}. ${item.description}`}
              className={cn(
                "flex w-full max-w-[5.5rem] flex-col items-center justify-center transition-transform duration-200 ease-out",
                "active:scale-95 motion-reduce:active:scale-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                  selected
                    ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/50"
                    : "border-gray-200 bg-gray-50 dark:border-zinc-600 dark:bg-zinc-800/80",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors duration-200",
                    selected ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-zinc-500",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <span className="mt-2 line-clamp-2 min-h-[2rem] w-full px-0.5 text-xs font-medium leading-tight text-gray-700 dark:text-zinc-200">
                {formatServiceName(item.name)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop: full description cards */}
      <div className="hidden grid-cols-3 gap-4 lg:grid">
        {SERVICE_GRID_ITEMS.map((item) => {
          const disabled = allow != null && !allow.has(item.id);
          return (
            <ServiceGridCard
              key={item.id}
              id={item.id}
              name={item.name}
              description={item.description}
              Icon={item.Icon}
              selected={value === item.id}
              disabled={disabled}
              onSelect={onChange}
            />
          );
        })}
      </div>
    </>
  );
}
