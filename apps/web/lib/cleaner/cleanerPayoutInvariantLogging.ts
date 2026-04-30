import { logSystemEvent } from "@/lib/logging/systemLog";
import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";

const STUCK_EARNINGS_MS = 5 * 60 * 1000;

/** Log when DB invariants are violated (should not happen once constraints + settlement are correct). */
export function logEligibleOrPaidWithoutFrozen(bookingId: string, record: Record<string, unknown>): void {
  const ps = String(record.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (ps !== "eligible" && ps !== "paid") return;
  const frozen = optionalCentsFromDb(record.payout_frozen_cents);
  if (frozen != null) return;
  void logSystemEvent({
    level: "error",
    source: "cleaner_jobs_api",
    message: "eligible_or_paid_without_frozen",
    context: { booking_id: bookingId, payout_status: ps },
  });
}

/** True when assigned/in_progress long enough but cleaner-facing earnings are still unresolved. */
export function isStuckNullEarningsBooking(record: Record<string, unknown>): boolean {
  const st = String(record.status ?? "")
    .trim()
    .toLowerCase();
  if (st !== "assigned" && st !== "in_progress") return false;
  const cents = resolveCleanerEarningsCents({
    cleaner_earnings_total_cents: record.cleaner_earnings_total_cents,
    payout_frozen_cents: record.payout_frozen_cents,
    display_earnings_cents: record.display_earnings_cents,
  });
  if (cents != null && cents > 0) return false;
  const assignedRaw = record.assigned_at;
  if (typeof assignedRaw !== "string" || !assignedRaw.trim()) return false;
  const t = new Date(assignedRaw).getTime();
  if (Number.isNaN(t) || Date.now() - t < STUCK_EARNINGS_MS) return false;
  return true;
}

/** Log when a booking has been assigned long enough but cleaner-facing earnings are still unresolved. */
export function maybeLogStuckNullEarnings(bookingId: string, record: Record<string, unknown>): void {
  if (!isStuckNullEarningsBooking(record)) return;
  const st = String(record.status ?? "")
    .trim()
    .toLowerCase();
  const assignedRaw = record.assigned_at;
  void logSystemEvent({
    level: "warn",
    source: "cleaner_jobs_api",
    message: "earnings_stuck_null",
    context: { booking_id: bookingId, status: st, assigned_at: assignedRaw },
  });
}
