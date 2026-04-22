import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { BookingSnapshotFlatV1, BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type { BookingSnapshotFlatV1 } from "@/lib/booking/paystackChargeTypes";

export function buildSnapshotFlat(locked: LockedBooking | undefined | null): BookingSnapshotFlatV1 | null {
  if (!locked) return null;
  return {
    service: locked.service ?? null,
    rooms: typeof locked.rooms === "number" ? locked.rooms : null,
    bathrooms: typeof locked.bathrooms === "number" ? locked.bathrooms : null,
    extras: Array.isArray(locked.extras) ? locked.extras : [],
    location: typeof locked.location === "string" ? locked.location.trim() || null : null,
    date: typeof locked.date === "string" ? locked.date : null,
    time: typeof locked.time === "string" ? locked.time : null,
  };
}

/** Merges `flat` into snapshot for persistence. */
export function mergeSnapshotWithFlat(
  snapshot: BookingSnapshotV1 | null,
  flat: BookingSnapshotFlatV1 | null,
): Record<string, unknown> {
  const base = snapshot ? ({ ...snapshot } as Record<string, unknown>) : { v: 1 };
  if (flat) {
    base.flat = flat;
  }
  return base;
}
