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
