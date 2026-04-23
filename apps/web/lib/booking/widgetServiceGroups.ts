import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

export type WidgetServiceGroupId = "regular" | "specialised";

export type WidgetServiceOption = {
  readonly id: HomeWidgetServiceKey;
  readonly name: string;
  /** Short line under the service name in the picker. */
  readonly subtitle: string;
};

export type WidgetServiceGroupDef = {
  readonly id: WidgetServiceGroupId;
  readonly name: string;
  /** Short line under the title in the picker. */
  readonly subtitle: string;
  /** Longer phrase for accessibility / context. */
  readonly description: string;
  readonly services: readonly WidgetServiceOption[];
};

export const WIDGET_SERVICE_GROUPS: readonly WidgetServiceGroupDef[] = [
  {
    id: "regular",
    name: "Regular Cleaning",
    subtitle: "Maintenance & guest turnovers",
    description: "Weekly / maintenance cleaning and guest turnovers.",
    services: [
      { id: "standard", name: "Standard Cleaning", subtitle: "Regular home upkeep" },
      { id: "airbnb", name: "Airbnb Cleaning", subtitle: "Between-guest refresh" },
    ],
  },
  {
    id: "specialised",
    name: "Specialised Cleaning",
    subtitle: "Deep & intensive jobs",
    description: "Deep or intensive cleaning for bigger jobs.",
    services: [
      { id: "deep", name: "Deep Cleaning", subtitle: "Thorough top-to-bottom" },
      { id: "move", name: "Move In/Out Cleaning", subtitle: "Empty home ready" },
      { id: "carpet", name: "Carpet Cleaning", subtitle: "Fabrics & rugs" },
    ],
  },
];

export function widgetGroupForService(service: HomeWidgetServiceKey): WidgetServiceGroupDef {
  for (const g of WIDGET_SERVICE_GROUPS) {
    if (g.services.some((s) => s.id === service)) return g;
  }
  return WIDGET_SERVICE_GROUPS[0]!;
}

export function widgetServiceLabel(service: HomeWidgetServiceKey): string {
  for (const g of WIDGET_SERVICE_GROUPS) {
    const s = g.services.find((x) => x.id === service);
    if (s) return s.name;
  }
  return service;
}
