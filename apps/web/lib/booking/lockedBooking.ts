import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
} from "@/components/booking/serviceCategories";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { normalizeExtraRoomsRaw } from "@/lib/pricing/pricingEngine";
import { PRICING_CONFIG } from "@/lib/pricing/pricingConfig";

export const BOOKING_LOCKED_KEY = "booking_locked";

export const BOOKING_LOCKED_EVENT = "booking-locked-change";

export type LockedBooking = BookingStep1State & {
  /** Local calendar date `YYYY-MM-DD` */
  date: string;
  time: string;
  finalPrice: number;
  finalHours: number;
  /** Same as `finalPrice` when locked from `/api/booking/lock` (display / logging alias). */
  price?: number;
  /** Same as `finalHours` when locked from API. */
  duration?: number;
  /** Demand multiplier applied after VIP discount */
  surge: number;
  surgeLabel?: string;
  cleanersCount?: number;
  /**
   * Optional AI dynamic layer (0.8–1.2) multiplied with surge in `quoteCheckoutZar`.
   * Omitted in legacy web locks (= 1).
   */
  dynamicSurgeFactor?: number;
  /** Tier used when locking (must match server `quoteCheckoutZar`; drives loyalty discount). */
  vipTier?: VipTier;
  /** Snapshot from lock quote — display only; never subtract VIP again at checkout. */
  quoteSubtotalZar?: number;
  quoteAfterVipSubtotalZar?: number;
  quoteVipSavingsZar?: number;
  /** Matches {@link PRICING_CONFIG.version} at lock time; checkout rejects mismatch (`REQUOTE_REQUIRED`). */
  pricingVersion?: number;
  /** Selected cleaner for checkout — mirrored for `/api/booking/validate` (no re-fetch roster). */
  cleaner_id?: string | null;
  /** HMAC/SHA256 of canonical lock quote from `POST /api/booking/lock` — Paystack init requires a match. */
  quoteSignature?: string;
  /** ISO timestamp — checkout must complete before this (see `LOCK_HOLD_MS`). */
  lockExpiresAt?: string;
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
  const finalPrice =
    typeof data.finalPrice === "number" && Number.isFinite(data.finalPrice)
      ? data.finalPrice
      : typeof data.price === "number" && Number.isFinite(data.price)
        ? data.price
        : NaN;
  if (!Number.isFinite(finalPrice)) return null;
  const finalHours =
    typeof data.finalHours === "number" && Number.isFinite(data.finalHours)
      ? data.finalHours
      : typeof data.duration === "number" && Number.isFinite(data.duration)
        ? data.duration
        : NaN;
  if (!Number.isFinite(finalHours)) return null;
  if (typeof data.time !== "string" || !data.time) return null;
  if (typeof data.lockedAt !== "string") return null;
  if (typeof data.rooms !== "number" || typeof data.bathrooms !== "number") return null;
  if (!Array.isArray(data.extras)) return null;
  const extraRooms = normalizeExtraRoomsRaw(data.extraRooms);

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
    data.propertyType === "apartment" ||
    data.propertyType === "house" ||
    data.propertyType === "studio" ||
    data.propertyType === "office"
      ? data.propertyType
      : null;
  const cleaningFrequency =
    data.cleaningFrequency === "weekly" ||
    data.cleaningFrequency === "biweekly" ||
    data.cleaningFrequency === "monthly" ||
    data.cleaningFrequency === "one_time"
      ? data.cleaningFrequency
      : "one_time";

  return {
    ...data,
    extraRooms,
    date,
    finalPrice,
    finalHours,
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : finalPrice,
    duration:
      typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : finalHours,
    surge,
    locked: true,
    location,
    propertyType,
    cleaningFrequency,
    ...(vipTier ? { vipTier } : {}),
    ...(dynamicSurgeFactor != null ? { dynamicSurgeFactor } : {}),
  } as LockedBooking;
}

/** Single checkout display amount — prefer API snapshot field `price` when present. */
export function getLockedBookingDisplayPrice(locked: LockedBooking): number {
  return typeof locked.price === "number" && Number.isFinite(locked.price) ? locked.price : locked.finalPrice;
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
    cleaningFrequency: l.cleaningFrequency ?? "one_time",
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
 * Persists a slot decision: `finalPrice` must come from `POST /api/booking/lock` (server `quoteCheckoutZar`) via `lockedQuote`.
 */
export function lockBookingSlot(
  state: BookingStep1State,
  selection: { date: string; time: string },
  options: {
    vipTier?: VipTier;
    lockedQuote: {
      total: number;
      hours: number;
      surge: number;
      surgeLabel?: string;
      cleanersCount?: number;
      quoteSubtotalZar?: number;
      quoteAfterVipSubtotalZar?: number;
      quoteVipSavingsZar?: number;
      quoteSignature?: string;
      lockExpiresAt?: string;
      /** From `POST /api/booking/lock` — must match server tariff version. */
      pricingVersion?: number;
    };
  },
): LockedBooking {
  const tier = options?.vipTier ?? "regular";
  const quote = options.lockedQuote;

  const locked: LockedBooking = {
    ...state,
    date: selection.date,
    time: selection.time,
    finalPrice: quote.total,
    finalHours: quote.hours,
    price: quote.total,
    duration: quote.hours,
    surge: quote.surge,
    surgeLabel: quote.surgeLabel,
    cleanersCount: options.lockedQuote.cleanersCount,
    vipTier: tier,
    ...(typeof quote.quoteSubtotalZar === "number" && Number.isFinite(quote.quoteSubtotalZar)
      ? { quoteSubtotalZar: Math.round(quote.quoteSubtotalZar) }
      : {}),
    ...(typeof quote.quoteAfterVipSubtotalZar === "number" && Number.isFinite(quote.quoteAfterVipSubtotalZar)
      ? { quoteAfterVipSubtotalZar: Math.round(quote.quoteAfterVipSubtotalZar) }
      : {}),
    ...(typeof quote.quoteVipSavingsZar === "number" && Number.isFinite(quote.quoteVipSavingsZar)
      ? { quoteVipSavingsZar: Math.max(0, Math.round(quote.quoteVipSavingsZar)) }
      : {}),
    ...(typeof quote.quoteSignature === "string" && /^[0-9a-f]{64}$/i.test(quote.quoteSignature.trim())
      ? { quoteSignature: quote.quoteSignature.trim().toLowerCase() }
      : {}),
    ...(typeof quote.lockExpiresAt === "string" && quote.lockExpiresAt.trim()
      ? { lockExpiresAt: quote.lockExpiresAt.trim() }
      : {}),
    pricingVersion:
      typeof quote.pricingVersion === "number" && Number.isFinite(quote.pricingVersion)
        ? Math.round(quote.pricingVersion)
        : PRICING_CONFIG.version,
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

/** Persist selected cleaner id on the active lock for pay + `/api/booking/validate` (no roster re-fetch). */
export function mergeCleanerIdIntoLockedBooking(cleanerId: string): void {
  if (typeof window === "undefined") return;
  const id = cleanerId.trim();
  if (!id) return;
  try {
    const raw = localStorage.getItem(BOOKING_LOCKED_KEY);
    const parsed = parseLockedBooking(raw);
    if (!parsed) return;
    if (parsed.cleaner_id === id) return;
    const next = { ...parsed, cleaner_id: id } as LockedBooking;
    const serialized = JSON.stringify(next);
    localStorage.setItem(BOOKING_LOCKED_KEY, serialized);
    setSnapshotCache(serialized, next);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
  } catch {
    /* ignore */
  }
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
