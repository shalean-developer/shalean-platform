/**
 * Service catalog + booking funnel types. Pricing uses `BookingServiceId` in `lib/pricing/pricingEngine`.
 */

import type { ServiceCategoryKind } from "./CategoryPicker";

export type BookingServiceId =
  | "standard"
  | "airbnb"
  | "deep"
  | "move"
  | "carpet";

/** High-level funnel grouping (Step 2 cards + persistence). */
export type BookingServiceGroupKey = "regular" | "specialised";

/** Funnel service keys — map to `BookingServiceId` for pricing. */
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

const REGULAR_FLOW_SERVICE_IDS = new Set<BookingServiceId>(["standard", "airbnb"]);
const SPECIALISED_FLOW_SERVICE_IDS = new Set<BookingServiceId>(["deep", "move", "carpet"]);

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
  if (!service && !serviceType) return "Not selected";
  if (serviceType) return SERVICE_TYPE_DISPLAY[serviceType];
  if (!service) return "Not selected";
  return getServiceLabel(service);
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "regular",
    name: "Regular Cleaning",
    description: "For routine home cleaning",
    services: [
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
  /** Booking v2 catalog slugs (`bookings.service` / `service_slug`). */
  "regular-cleaning": "standard",
  "regular_cleaning": "standard",
  "deep-cleaning": "deep",
  "deep_cleaning": "deep",
  "moving-cleaning": "move",
  "moving_cleaning": "move",
  "airbnb-cleaning": "airbnb",
  "airbnb_cleaning": "airbnb",
  "carpet-cleaning": "carpet",
  "carpet_cleaning": "carpet",
  "office-cleaning": "standard",
  "office_cleaning": "standard",
};

/** Checkout / snapshot may store `BookingServiceTypeKey` strings instead of catalog ids. */
const SERVICE_TYPE_KEY_TO_SERVICE_ID: Record<string, BookingServiceId> = {
  standard_cleaning: "standard",
  airbnb_cleaning: "airbnb",
  deep_cleaning: "deep",
  move_cleaning: "move",
  carpet_cleaning: "carpet",
};

/** Parse a service id from stored snapshot / URL strings (includes legacy aliases). */
export function parseBookingServiceId(value: unknown): BookingServiceId | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if ((BOOKING_SERVICE_IDS as readonly string[]).includes(v)) {
    return v as BookingServiceId;
  }
  const norm = v.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if ((BOOKING_SERVICE_IDS as readonly string[]).includes(norm)) {
    return norm as BookingServiceId;
  }
  const fromTypeKey = SERVICE_TYPE_KEY_TO_SERVICE_ID[norm];
  if (fromTypeKey) return fromTypeKey;
  return LEGACY_SERVICE_MAP[v] ?? LEGACY_SERVICE_MAP[norm] ?? null;
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

/** Recurring visit plans (weekly / biweekly discounts) apply only to Standard and Airbnb services. */
export function serviceSupportsCleaningFrequencyPlan(
  service: BookingServiceId | null,
  serviceType: BookingServiceTypeKey | null,
): boolean {
  if (service === "standard" || service === "airbnb") return true;
  if (serviceType === "standard_cleaning" || serviceType === "airbnb_cleaning") return true;
  return false;
}

export function normalizeStep1ForService<
  T extends {
    service: BookingServiceId | null;
    rooms: number;
    extras: string[];
    service_type?: BookingServiceTypeKey | null;
    cleaningFrequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  },
>(prev: T): T {
  if (prev.service === null) return prev;
  const maxRooms = getMaxRoomsForService(prev.service);
  const blocked = getBlockedExtraIds(prev.service);
  const rooms = Math.min(prev.rooms, maxRooms);
  const extras = prev.extras.filter((e) => !blocked.has(e));

  const svcType = "service_type" in prev ? (prev.service_type ?? null) : null;
  const supportsPlan = serviceSupportsCleaningFrequencyPlan(prev.service, svcType);
  const hasFreq =
    "cleaningFrequency" in prev && prev.cleaningFrequency !== undefined && prev.cleaningFrequency !== null;
  const nextFrequency = hasFreq
    ? supportsPlan
      ? prev.cleaningFrequency
      : ("one_time" as const)
    : undefined;
  const freqSame = !hasFreq || prev.cleaningFrequency === nextFrequency;

  const roomsSame = rooms === prev.rooms;
  const extrasSame = extras.length === prev.extras.length;
  if (roomsSame && extrasSame && freqSame) return prev;

  return {
    ...prev,
    ...(!roomsSame ? { rooms } : {}),
    ...(!extrasSame ? { extras } : {}),
    ...(hasFreq && !freqSame ? { cleaningFrequency: nextFrequency } : {}),
  } as T;
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
