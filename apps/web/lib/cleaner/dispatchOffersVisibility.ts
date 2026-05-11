/**
 * Pure filter helpers used by `GET /api/cleaner/offers` to decide which
 * `dispatch_offers` rows the cleaner is allowed to see on the dashboard.
 *
 * Pulled out so we can unit-test the visibility contract independently of the
 * Supabase client wiring. The route MUST keep using these helpers so
 * regressions are caught here instead of via end-to-end testing only.
 */

export type DispatchOfferVisibilityRow = {
  dispatch_visible_at?: string | null;
};

export type DispatchOfferAssignmentBooking = {
  status?: string | null;
  cleaner_id?: string | null;
  is_team_job?: boolean | null;
};

/** Statuses where a booking is already actively held by a cleaner (solo or team). */
const ASSIGNED_BOOKING_STATUSES = new Set<string>(["assigned", "confirmed", "in_progress"]);

/**
 * Returns true when the row's `dispatch_visible_at` does not gate it (null /
 * empty / not a finite timestamp / past).
 *
 * Empty/missing/invalid `dispatch_visible_at` values must NOT hide the offer —
 * legacy rows and the standard checkout path leave the column null.
 */
export function isDispatchOfferVisibleNow(row: DispatchOfferVisibilityRow, nowMs: number): boolean {
  const raw = row.dispatch_visible_at;
  if (raw == null || raw === "") return true;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return true;
  return t <= nowMs;
}

/**
 * Returns true when the offer should remain visible to this cleaner — i.e. the
 * underlying booking is NOT already actively assigned to them (solo or via the
 * `booking_cleaners` roster).
 *
 * - No booking row loaded → keep visible (defensive default; the row will be
 *   removed by the next refresh once the join lands).
 * - Booking is in a non-assigned status (`pending_assignment`, `pending`,
 *   `pending_payment`, `searching`, …) → keep visible. **This is the common
 *   selected-cleaner-checkout path** for booking 13cacd49-… and friends.
 * - Booking is `assigned` / `confirmed` / `in_progress`:
 *     · solo job already on this cleaner → hide (stale duplicate).
 *     · team job and this cleaner is on the roster → hide (stale duplicate).
 *     · otherwise → keep visible.
 */
export function isDispatchOfferUnclaimedForCleaner(args: {
  booking: DispatchOfferAssignmentBooking | null | undefined;
  bookingId: string;
  cleanerId: string;
  rosterBookingIds: ReadonlySet<string>;
}): boolean {
  const b = args.booking;
  if (!b) return true;
  const st = String(b.status ?? "")
    .trim()
    .toLowerCase();
  if (!ASSIGNED_BOOKING_STATUSES.has(st)) return true;
  if (String(b.cleaner_id ?? "").trim() === args.cleanerId) return false;
  if (b.is_team_job === true && args.rosterBookingIds.has(args.bookingId)) return false;
  return true;
}
