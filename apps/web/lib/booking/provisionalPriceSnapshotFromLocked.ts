import "server-only";

import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { buildPriceSnapshotV1Checkout } from "@/lib/booking/priceSnapshotBooking";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/** Checkout-shaped snapshot for `bookings.price_snapshot` (matches `bookings_price_snapshot_required_check`). */
export function provisionalPriceSnapshotFromLocked(locked: LockedBooking): Record<string, unknown> {
  const total = Math.round(
    typeof locked.finalPrice === "number" && Number.isFinite(locked.finalPrice) ? locked.finalPrice : 0,
  );
  const st =
    locked.service && String(locked.service).trim() ? adminBookingServiceSlug(String(locked.service)) : "standard";
  return buildPriceSnapshotV1Checkout({
    service_type: st,
    base_price: total,
    extras: [],
    total_price: total,
  }) as Record<string, unknown>;
}

/** Plain JSON object for Supabase/PostgREST (avoids non-enumerable / class prototype issues). */
export function provisionalPriceSnapshotJson(locked: LockedBooking): Record<string, unknown> {
  return JSON.parse(JSON.stringify(provisionalPriceSnapshotFromLocked(locked))) as Record<string, unknown>;
}
