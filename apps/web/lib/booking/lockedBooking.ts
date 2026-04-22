import { calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
} from "@/components/booking/serviceCategories";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";

export const BOOKING_LOCKED_KEY = "booking_locked";

export const BOOKING_LOCKED_EVENT = "booking-locked-change";

export type LockedBooking = BookingStep1State & {
  /** Local calendar date `YYYY-MM-DD` */
  date: string;
  time: string;
  finalPrice: number;
  finalHours: number;
  /** Demand multiplier applied after VIP discount */
  surge: number;
  /**
   * Optional AI dynamic layer (0.8–1.2) multiplied with surge in `calculateSmartQuote`.
   * Omitted in legacy web locks (= 1).
   */
  dynamicSurgeFactor?: number;
  /** Tier used when locking (drives loyalty discount) */
  vipTier?: VipTier;
  /** `2` = VIP + demand pricing; omit = legacy clients should re-lock */
  pricingVersion?: number;
  locked: true;
  lockedAt: string;
};

let snapshotCache: { raw: string | null; value: LockedBooking | null } | null = null;

function setSnapshotCache(raw: string | null, value: LockedBooking | null) {
  snapshotCache = { raw, value };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseDateYmd(v: unknown, lockedAt: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (typeof lockedAt === "string" && lockedAt.length >= 10) {
    const slice = lockedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;
  }
  return null;
}

export function parseLockedBooking(raw: string | null): LockedBooking | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (data.locked !== true) return null;
  if (typeof data.finalPrice !== "number" || !Number.isFinite(data.finalPrice)) return null;
  if (typeof data.finalHours !== "number" || !Number.isFinite(data.finalHours)) return null;
  if (typeof data.time !== "string" || !data.time) return null;
  if (typeof data.lockedAt !== "string") return null;
  if (typeof data.rooms !== "number" || typeof data.bathrooms !== "number") return null;
  if (typeof data.extraRooms !== "number" || !Array.isArray(data.extras)) return null;

  const date = parseDateYmd(data.date, data.lockedAt);
  if (!date) return null;

  const surge =
    typeof data.surge === "number" && Number.isFinite(data.surge) && data.surge > 0 ? data.surge : 1;

  const vipTierRaw = typeof data.vipTier === "string" ? data.vipTier : undefined;
  const vipTier = vipTierRaw ? normalizeVipTier(vipTierRaw) : undefined;

  const location =
    typeof data.location === "string" ? data.location.trim().slice(0, 500) : "";

  let dynamicSurgeFactor: number | undefined;
  if (typeof data.dynamicSurgeFactor === "number" && Number.isFinite(data.dynamicSurgeFactor)) {
    const d = data.dynamicSurgeFactor;
    if (d >= 0.8 && d <= 1.2 && d !== 1) dynamicSurgeFactor = d;
  }

  const propertyType =
    data.propertyType === "apartment" || data.propertyType === "house" ? data.propertyType : null;

  return {
    ...data,
    date,
    surge,
    locked: true,
    location,
    propertyType,
    ...(vipTier ? { vipTier } : {}),
    ...(dynamicSurgeFactor != null ? { dynamicSurgeFactor } : {}),
  } as LockedBooking;
}

/** Parse a client/API payload (e.g. POST body) into a valid `LockedBooking`. */
export function parseLockedBookingFromUnknown(data: unknown): LockedBooking | null {
  if (data === null || typeof data !== "object") return null;
  try {
    return parseLockedBooking(JSON.stringify(data));
  } catch {
    return null;
  }
}

export function readLockedBookingFromStorage(): LockedBooking | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOKING_LOCKED_KEY);
    if (snapshotCache && snapshotCache.raw === raw) {
      return snapshotCache.value;
    }
    const parsed = parseLockedBooking(raw);
    setSnapshotCache(raw, parsed);
    return parsed;
  } catch {
    setSnapshotCache(null, null);
    return null;
  }
}

export function lockedToStep1State(l: LockedBooking): BookingStep1State {
  const group =
    l.service_group ?? (l.service ? inferServiceGroupFromServiceId(l.service) : null);
  const typ = l.service_type ?? (l.service ? inferServiceTypeFromServiceId(l.service) : null);
  return {
    selectedCategory: l.selectedCategory ?? group,
    service: l.service,
    service_group: group,
    service_type: typ,
    location: l.location ?? "",
    propertyType: l.propertyType ?? null,
    rooms: l.rooms,
    bathrooms: l.bathrooms,
    extraRooms: l.extraRooms,
    extras: l.extras,
  };
}

export function formatLockedAppointmentLabel(locked: LockedBooking): string {
  const [y, m, d] = locked.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayPart = date.toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayPart} · ${locked.time}`;
}

/**
 * Persists a slot decision: `finalPrice` comes from `calculateSmartQuote` (VIP + demand) and is fixed for checkout.
 */
export function lockBookingSlot(
  state: BookingStep1State,
  selection: { date: string; time: string },
  options?: { vipTier?: VipTier },
): LockedBooking {
  const tier = options?.vipTier ?? "regular";
  const quote = calculateSmartQuote(
    {
      service: state.service,
      serviceType: state.service_type,
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
    },
    selection.time,
    tier,
  );

  const locked: LockedBooking = {
    ...state,
    date: selection.date,
    time: selection.time,
    finalPrice: quote.total,
    finalHours: quote.hours,
    surge: quote.surge,
    vipTier: tier,
    pricingVersion: 2,
    locked: true,
    lockedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const prev = parseLockedBooking(localStorage.getItem(BOOKING_LOCKED_KEY));
    const slotChanged =
      !prev || prev.date !== selection.date || prev.time !== selection.time;

    const serialized = JSON.stringify(locked);
    localStorage.setItem(BOOKING_LOCKED_KEY, serialized);
    setSnapshotCache(serialized, locked);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));

    if (slotChanged) clearSelectedCleanerFromStorage();
  }

  return locked;
}

export function clearLockedBookingFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_LOCKED_KEY);
    setSnapshotCache(null, null);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
  } catch {
    /* ignore */
  }
}
