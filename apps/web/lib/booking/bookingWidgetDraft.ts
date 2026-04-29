import type { BookingServiceId } from "@/components/booking/serviceCategories";
import {
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { defaultBookingTimeForDate, todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

/** Primary key (user spec); legacy widget key still read once. */
export const BOOKING_DATA_STORAGE_KEY = "bookingData";
export const LIVE_WIDGET_STORAGE_KEY = "shalean_live_booking_widget";

export const WIDGET_INTAKE_SESSION_KEY = "shalean_widget_intake";

const WIDGET_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseWidgetUuid(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s || !WIDGET_UUID_RE.test(s)) return null;
  return s;
}

export type WidgetIntakePayload = {
  bedrooms: number;
  bathrooms: number;
  /** Extra living spaces (0–5); `5` = “5+” for pricing cap. */
  extraRooms: number;
  service: HomeWidgetServiceKey;
  date: string;
  time: string;
  extras: string[];
  location: string;
  serviceAreaLocationId?: string | null;
  serviceAreaCityId?: string | null;
  serviceAreaName?: string;
  quotedPriceZar?: number;
  savedAt?: string;
  /** Homepage quick estimate — rooms/extras not collected on `/`. */
  estimateOnly?: boolean;
};

export function mapWidgetServiceToBookingServiceId(s: HomeWidgetServiceKey): BookingServiceId {
  switch (s) {
    case "standard":
      return "standard";
    case "airbnb":
      return "airbnb";
    case "deep":
      return "deep";
    case "move":
      return "move";
    case "carpet":
      return "carpet";
    default:
      return "standard";
  }
}

/** Widget short ids → main funnel `BookingStep1State.extras` ids. */
const WIDGET_EXTRA_TO_STEP1: Record<string, string> = {
  fridge: "inside-fridge",
  oven: "inside-oven",
  cabinets: "inside-cabinets",
  windows: "interior-windows",
  walls: "interior-walls",
  plants: "water-plants",
  ironing: "ironing",
  laundry: "laundry",
  flatlet: "small-flatlet",
};

export function mapWidgetExtrasToStep1Ids(extras: string[]): string[] {
  const out: string[] = [];
  for (const e of extras) {
    if (typeof e !== "string" || !e) continue;
    const mapped = WIDGET_EXTRA_TO_STEP1[e];
    out.push(mapped ?? e);
  }
  return out;
}

export function parseWidgetIntakeFromUnknown(raw: unknown): WidgetIntakePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const estimateOnly = o.estimateOnly === true;

  const bedroomsRaw = typeof o.bedrooms === "number" ? o.bedrooms : Number(o.bedrooms);
  const bathroomsRaw = typeof o.bathrooms === "number" ? o.bathrooms : Number(o.bathrooms);
  let bedrooms: number;
  let bathrooms: number;
  if (estimateOnly) {
    bedrooms = Number.isFinite(bedroomsRaw) ? Math.min(5, Math.max(1, Math.round(bedroomsRaw))) : 2;
    bathrooms = Number.isFinite(bathroomsRaw) ? Math.min(3, Math.max(1, Math.round(bathroomsRaw))) : 1;
  } else {
    if (!Number.isFinite(bedroomsRaw) || !Number.isFinite(bathroomsRaw)) return null;
    bedrooms = Math.min(5, Math.max(1, Math.round(bedroomsRaw)));
    bathrooms = Math.min(3, Math.max(1, Math.round(bathroomsRaw)));
  }

  const serviceRaw = typeof o.service === "string" ? o.service : "";
  if (!isHomeWidgetServiceKey(serviceRaw)) return null;

  let date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "";
  let time = typeof o.time === "string" && o.time.trim() ? o.time.trim() : "";
  if (estimateOnly) {
    if (!date) date = todayBookingYmd();
    if (!time) time = defaultBookingTimeForDate(date);
  }
  if (!date || !time) return null;

  const extras = Array.isArray(o.extras)
    ? o.extras.filter((x): x is string => typeof x === "string")
    : [];
  const location = typeof o.location === "string" ? o.location.trim().slice(0, 500) : "";

  const extraRoomsRaw =
    o.extraRooms === undefined || o.extraRooms === null
      ? 0
      : typeof o.extraRooms === "number"
        ? o.extraRooms
        : Number(o.extraRooms);
  const extraRooms = Number.isFinite(extraRoomsRaw) ? Math.min(5, Math.max(0, Math.round(extraRoomsRaw))) : 0;

  const quotedPriceZar =
    typeof o.quotedPriceZar === "number" && Number.isFinite(o.quotedPriceZar) ? o.quotedPriceZar : undefined;
  const savedAt = typeof o.savedAt === "string" ? o.savedAt : undefined;
  const serviceAreaLocationId = parseWidgetUuid(o.serviceAreaLocationId);
  const serviceAreaCityId = parseWidgetUuid(o.serviceAreaCityId);
  const serviceAreaName =
    typeof o.serviceAreaName === "string" ? o.serviceAreaName.trim().slice(0, 120) : "";

  return {
    bedrooms,
    bathrooms,
    extraRooms,
    service: serviceRaw,
    date,
    time,
    extras,
    location,
    ...(serviceAreaLocationId
      ? { serviceAreaLocationId, serviceAreaCityId: serviceAreaCityId ?? null, serviceAreaName }
      : {}),
    quotedPriceZar,
    savedAt,
    estimateOnly,
  };
}

function isHomeWidgetServiceKey(s: string): s is HomeWidgetServiceKey {
  return s === "standard" || s === "airbnb" || s === "deep" || s === "move" || s === "carpet";
}

export function widgetIntakeToStep1State(intake: WidgetIntakePayload): BookingStep1State {
  const service = mapWidgetServiceToBookingServiceId(intake.service);
  const service_group = inferServiceGroupFromServiceId(service);
  const service_type = inferServiceTypeFromServiceId(service);
  const sid = parseWidgetUuid(intake.serviceAreaLocationId);
  const scid = parseWidgetUuid(intake.serviceAreaCityId);
  const sname =
    typeof intake.serviceAreaName === "string" ? intake.serviceAreaName.trim().slice(0, 120) : "";
  const allowLocationTextFallback = !sid && !!(typeof intake.location === "string" ? intake.location.trim() : "");
  return {
    selectedCategory: service_group,
    service,
    service_group,
    service_type,
    serviceAreaLocationId: sid,
    serviceAreaCityId: scid,
    serviceAreaName: sname,
    location: intake.location,
    propertyType: null,
    cleaningFrequency: "one_time",
    rooms: intake.bedrooms,
    bathrooms: intake.bathrooms,
    extraRooms: intake.extraRooms ?? 0,
    extras: mapWidgetExtrasToStep1Ids(intake.extras),
    ...(allowLocationTextFallback ? { allowLocationTextFallback: true } : {}),
  };
}

function syncStep1ServiceFields(s: BookingStep1State): BookingStep1State {
  if (!s.service) return s;
  const inferredGroup = inferServiceGroupFromServiceId(s.service);
  const inferredType = inferServiceTypeFromServiceId(s.service);
  return {
    ...s,
    selectedCategory: inferredGroup ?? s.selectedCategory,
    service_group: inferredGroup ?? s.service_group,
    service_type: inferredType ?? s.service_type,
  };
}

export function finalizeWidgetStep1(intake: WidgetIntakePayload): BookingStep1State {
  const base = widgetIntakeToStep1State(intake);
  return syncStep1ServiceFields(normalizeStep1ForService(base));
}

/**
 * One-shot: read homepage widget localStorage, persist intake to sessionStorage for checkout handoff,
 * clear widget keys, return normalized step-1 state (or null).
 */
export function consumeWidgetDraftForHydration(): BookingStep1State | null {
  if (typeof window === "undefined") return null;
  const raw = readRawBookingWidgetFromBrowserStorage();
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const intake = parseWidgetIntakeFromUnknown(data);
  if (!intake) return null;
  try {
    sessionStorage.setItem(WIDGET_INTAKE_SESSION_KEY, JSON.stringify(intake));
  } catch {
    /* ignore */
  }
  clearBookingWidgetBrowserStorage();
  return finalizeWidgetStep1(intake);
}

export function readRawBookingWidgetFromBrowserStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem(BOOKING_DATA_STORAGE_KEY) ??
      localStorage.getItem(LIVE_WIDGET_STORAGE_KEY) ??
      null
    );
  } catch {
    return null;
  }
}

export function clearBookingWidgetBrowserStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_DATA_STORAGE_KEY);
    localStorage.removeItem(LIVE_WIDGET_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readWidgetIntakeFromSessionStorage(): WidgetIntakePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WIDGET_INTAKE_SESSION_KEY);
    if (!raw) return null;
    return parseWidgetIntakeFromUnknown(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function clearWidgetIntakeSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WIDGET_INTAKE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Locks checkout with the homepage-widget server total (`/api/bookings` recalculates).
 * `hours` is a display-only estimate — `pricingVersion` must match the current checkout lock algorithm version for Paystack init.
 */
export function buildWidgetLockedQuote(totalZar: number): {
  total: number;
  hours: number;
  surge: number;
  surgeLabel?: string;
  cleanersCount?: number;
} {
  const total = Math.round(Number(totalZar) || 0);
  const hours = Math.max(2, Math.min(10, Math.round(total / 95)));
  return {
    total,
    hours,
    surge: 1,
    surgeLabel: "Homepage quote",
    cleanersCount: 0,
  };
}
