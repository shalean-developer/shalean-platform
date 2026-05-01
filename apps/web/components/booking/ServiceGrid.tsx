"use client";

import { useMemo } from "react";
import { Building, Home, Sofa, Sparkles, Truck, Zap, type LucideIcon } from "lucide-react";
import { ServiceGridCard } from "@/components/booking/ServiceGridCard";

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
    <div className="grid grid-cols-3 gap-4">
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
  );
}
