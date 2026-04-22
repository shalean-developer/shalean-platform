import {
  parseBookingServiceId,
  type BookingServiceId,
} from "@/components/booking/serviceCategories";

export const BOOKING_PRICE_PREVIEW_KEY = "booking_price_preview_v1";

export type BookingPricePreviewLock = {
  /** Job subtotal (no time-slot demand surge). */
  finalPrice: number;
  /** Always 1 until checkout lock applies slot surge. */
  surgeMultiplier: number;
  lockedAt: string;
  estimatedHours: number;
  service: BookingServiceId;
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseBookingPricePreviewLock(raw: string | null): BookingPricePreviewLock | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (typeof data.finalPrice !== "number" || !Number.isFinite(data.finalPrice)) return null;
  if (typeof data.lockedAt !== "string") return null;
  if (typeof data.estimatedHours !== "number" || !Number.isFinite(data.estimatedHours)) return null;
  const svc = parseBookingServiceId(data.service);
  if (!svc) return null;
  const surge =
    typeof data.surgeMultiplier === "number" && Number.isFinite(data.surgeMultiplier)
      ? data.surgeMultiplier
      : 1;
  const extras = Array.isArray(data.extras)
    ? data.extras.filter((e): e is string => typeof e === "string")
    : [];
  return {
    finalPrice: data.finalPrice,
    surgeMultiplier: surge,
    lockedAt: data.lockedAt,
    estimatedHours: data.estimatedHours,
    service: svc,
    rooms: typeof data.rooms === "number" ? data.rooms : 1,
    bathrooms: typeof data.bathrooms === "number" ? data.bathrooms : 1,
    extraRooms: typeof data.extraRooms === "number" ? data.extraRooms : 0,
    extras,
  };
}

export function readBookingPricePreviewFromStorage(): BookingPricePreviewLock | null {
  if (typeof window === "undefined") return null;
  try {
    return parseBookingPricePreviewLock(localStorage.getItem(BOOKING_PRICE_PREVIEW_KEY));
  } catch {
    return null;
  }
}

export function writeBookingPricePreviewLock(lock: BookingPricePreviewLock): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOOKING_PRICE_PREVIEW_KEY, JSON.stringify(lock));
    window.dispatchEvent(new Event("booking-storage-sync"));
  } catch {
    /* ignore */
  }
}

export function clearBookingPricePreviewFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_PRICE_PREVIEW_KEY);
    window.dispatchEvent(new Event("booking-storage-sync"));
  } catch {
    /* ignore */
  }
}
