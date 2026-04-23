/**
 * Service catalog + booking funnel types. Pricing uses `BookingServiceId` in `lib/pricing/pricingEngine`.
 */

import type { ServiceCategoryKind } from "./CategoryPicker";

export type BookingServiceId =
  | "quick"
  | "standard"
  | "airbnb"
  | "deep"
  | "carpet"
  | "move";

/** High-level funnel grouping (Step 2 cards + persistence). */
export type BookingServiceGroupKey = "regular" | "specialised";

/**
 * Funnel service keys — map to `BookingServiceId` for pricing.
 * `quick` remains a catalog id only; infer as regular / standard_cleaning for legacy data.
 */
export type BookingServiceTypeKey =
  | "standard_cleaning"
  | "airbnb_cleaning"
  | "deep_cleaning"
  | "move_cleaning"
  | "carpet_cleaning";

export type ServiceItem = {
  id: BookingServiceId;
  name: string;
  description: string;
  badge?: string;
  /** Relative to “standard” baseline — consumed by pricing, not shown as a price */
  baseTimeMultiplier?: number;
  basePriceMultiplier?: number;
  constraints?: {
    maxRooms: number;
    blockedExtraIds: readonly string[];
  };
};

export type ServiceCategory = {
  id: "regular" | "specialised";
  name: string;
  description: string;
  services: ServiceItem[];
};

export const SERVICE_TYPE_DISPLAY: Record<BookingServiceTypeKey, string> = {
  standard_cleaning: "Standard Cleaning",
  airbnb_cleaning: "Airbnb Cleaning",
  deep_cleaning: "Deep Cleaning",
  move_cleaning: "Move In/Out Cleaning",
  carpet_cleaning: "Carpet Cleaning",
};

const TYPE_TO_SERVICE_ID: Record<BookingServiceTypeKey, BookingServiceId> = {
  standard_cleaning: "standard",
  airbnb_cleaning: "airbnb",
  deep_cleaning: "deep",
  move_cleaning: "move",
  carpet_cleaning: "carpet",
};

export function bookingServiceIdFromType(t: BookingServiceTypeKey): BookingServiceId {
  return TYPE_TO_SERVICE_ID[t];
}

const REGULAR_FLOW_SERVICE_IDS = new Set<BookingServiceId>(["quick", "standard", "airbnb"]);
const SPECIALISED_FLOW_SERVICE_IDS = new Set<BookingServiceId>(["deep", "carpet", "move"]);

export function inferServiceGroupFromServiceId(service: BookingServiceId | null): BookingServiceGroupKey | null {
  if (!service) return null;
  if (REGULAR_FLOW_SERVICE_IDS.has(service)) return "regular";
  if (SPECIALISED_FLOW_SERVICE_IDS.has(service)) return "specialised";
  return null;
}

export function inferServiceTypeFromServiceId(service: BookingServiceId | null): BookingServiceTypeKey | null {
  if (!service) return null;
  switch (service) {
    case "standard":
    case "quick":
      return "standard_cleaning";
    case "airbnb":
      return "airbnb_cleaning";
    case "deep":
      return "deep_cleaning";
    case "move":
      return "move_cleaning";
    case "carpet":
      return "carpet_cleaning";
    default:
      return null;
  }
}

/** One-line label for summary / checkout. */
export function getBookingSummaryServiceLabel(
  service: BookingServiceId | null,
  serviceType: BookingServiceTypeKey | null,
): string {
  if (!service) return "Not selected";
  if (service === "quick") return "Quick Clean";
  if (serviceType) {
    if (service === "standard" && serviceType === "standard_cleaning") return SERVICE_TYPE_DISPLAY.standard_cleaning;
    if (service === "airbnb" && serviceType === "airbnb_cleaning") return SERVICE_TYPE_DISPLAY.airbnb_cleaning;
    if (service === "deep" && serviceType === "deep_cleaning") return SERVICE_TYPE_DISPLAY.deep_cleaning;
    if (service === "move" && serviceType === "move_cleaning") return SERVICE_TYPE_DISPLAY.move_cleaning;
    if (service === "carpet" && serviceType === "carpet_cleaning") return SERVICE_TYPE_DISPLAY.carpet_cleaning;
  }
  return getServiceLabel(service);
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "regular",
    name: "Regular Cleaning",
    description: "For routine home cleaning",
    services: [
      {
        id: "quick",
        name: "Quick Clean",
        description: "Fast refresh for light cleaning needs",
        badge: "Fast & affordable",
        baseTimeMultiplier: 0.65,
        basePriceMultiplier: 0.72,
        constraints: {
          maxRooms: 5,
          blockedExtraIds: ["inside-cabinets", "inside-oven", "ironing"],
        },
      },
      {
        id: "standard",
        name: "Standard Cleaning",
        description: "Most popular for weekly cleaning",
        badge: "Most popular",
        baseTimeMultiplier: 1,
        basePriceMultiplier: 1,
      },
      {
        id: "airbnb",
        name: "Airbnb Cleaning",
        description: "Perfect for guest turnovers",
        baseTimeMultiplier: 1.05,
        basePriceMultiplier: 1.08,
      },
    ],
  },
  {
    id: "specialised",
    name: "Specialised Cleaning",
    description: "For deeper or specific cleaning needs",
    services: [
      {
        id: "deep",
        name: "Deep Cleaning",
        description: "Intensive clean for high-traffic or neglected spaces",
        baseTimeMultiplier: 1.35,
        basePriceMultiplier: 1.32,
      },
      {
        id: "move",
        name: "Move In/Out Cleaning",
        description: "Empty-home clean for handovers and new keys",
        baseTimeMultiplier: 1.25,
        basePriceMultiplier: 1.22,
      },
      {
        id: "carpet",
        name: "Carpet Cleaning",
        description: "Focused care for rugs and carpeted areas",
        baseTimeMultiplier: 1.1,
        basePriceMultiplier: 1.15,
      },
    ],
  },
];

const SERVICE_BY_ID = {} as Record<BookingServiceId, ServiceItem>;
for (const cat of SERVICE_CATEGORIES) {
  for (const s of cat.services) {
    SERVICE_BY_ID[s.id] = s;
  }
}

export const BOOKING_SERVICE_IDS: readonly BookingServiceId[] = SERVICE_CATEGORIES.flatMap(
  (c) => c.services.map((s) => s.id),
);

const LEGACY_SERVICE_MAP: Record<string, BookingServiceId> = {
  basic: "standard",
  premium: "deep",
};

/** Parse a service id from stored snapshot / URL strings (includes legacy aliases). */
export function parseBookingServiceId(value: unknown): BookingServiceId | null {
  if (typeof value !== "string") return null;
  if ((BOOKING_SERVICE_IDS as readonly string[]).includes(value)) {
    return value as BookingServiceId;
  }
  return LEGACY_SERVICE_MAP[value] ?? null;
}

export function getServiceById(id: BookingServiceId): ServiceItem {
  return SERVICE_BY_ID[id];
}

export function getServiceLabel(id: BookingServiceId): string {
  return SERVICE_BY_ID[id]?.name ?? id;
}

export function getMaxRoomsForService(service: BookingServiceId | null): number {
  if (!service) return 10;
  const c = SERVICE_BY_ID[service]?.constraints;
  return c?.maxRooms ?? 10;
}

export function getBlockedExtraIds(service: BookingServiceId | null): Set<string> {
  if (!service) return new Set();
  const blocked = SERVICE_BY_ID[service]?.constraints?.blockedExtraIds;
  return blocked ? new Set(blocked) : new Set();
}

export function normalizeStep1ForService<
  T extends {
    service: BookingServiceId | null;
    rooms: number;
    extras: string[];
  },
>(prev: T): T {
  if (prev.service === null) return prev;
  const maxRooms = getMaxRoomsForService(prev.service);
  const blocked = getBlockedExtraIds(prev.service);
  const rooms = Math.min(prev.rooms, maxRooms);
  const extras = prev.extras.filter((e) => !blocked.has(e));
  if (rooms === prev.rooms && extras.length === prev.extras.length) return prev;
  return { ...prev, rooms, extras };
}

/** Updates `service` plus funnel fields after picking a catalog service (e.g. legacy BookingStep1). */
export function withBookingServiceSelection<
  T extends {
    service: BookingServiceId | null;
    rooms: number;
    extras: string[];
    selectedCategory: ServiceCategoryKind | null;
    service_group: BookingServiceGroupKey | null;
    service_type: BookingServiceTypeKey | null;
  },
>(prev: T, serviceId: BookingServiceId): T {
  const group = inferServiceGroupFromServiceId(serviceId);
  const typ = inferServiceTypeFromServiceId(serviceId);
  return normalizeStep1ForService({
    ...prev,
    service: serviceId,
    selectedCategory: group,
    service_group: group,
    service_type: typ,
  } as T);
}
