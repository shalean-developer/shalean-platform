import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns lowercase UUID or null. */
export function normalizeUuidCandidate(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || !UUID_RE.test(t)) return null;
  return t.toLowerCase();
}

/**
 * Customer-chosen cleaner at checkout: `locked.cleaner_id` (persisted lock) or top-level snapshot
 * fields from Paystack metadata (`paystackInitializeCore` sets `cleaner_id` on metadata / snapshot).
 */
export function pickUserSelectedCleanerId(
  lockedRow: LockedBooking | null,
  snapshot: BookingSnapshotV1 | null,
): string | null {
  const fromLocked = normalizeUuidCandidate(lockedRow?.cleaner_id ?? undefined);
  if (fromLocked) return fromLocked;
  return normalizeUuidCandidate(snapshot?.cleaner_id ?? undefined);
}

/**
 * Merge Paystack/checkout snapshot pick with a `pending_payment` row that already stored
 * `bookings.selected_cleaner_id` (e.g. flow intake) when the snapshot lock omits `cleaner_id`.
 */
export function mergePickedCleanerWithPersistedBookingSelection(
  pickedFromSnapshot: string | null,
  existingBookingSelectedCleanerId: string | null | undefined,
): string | null {
  if (pickedFromSnapshot) return pickedFromSnapshot;
  return normalizeUuidCandidate(existingBookingSelectedCleanerId);
}

/**
 * Whether Paystack finalize should explicitly set `selected_cleaner_id` to null on the paid row.
 * On checkout resolution `fallback`, we keep the column so ops can still see the customer intent
 * (and `attempted_cleaner_id` records the failed pick trace).
 */
export function paystackFinalizeClearsSelectedCleanerId(input: {
  userConfirmedCleanerId: string | null;
  checkoutResolutionKind: "no_pick" | "honor" | "fallback";
}): boolean {
  return input.userConfirmedCleanerId == null && input.checkoutResolutionKind !== "fallback";
}
