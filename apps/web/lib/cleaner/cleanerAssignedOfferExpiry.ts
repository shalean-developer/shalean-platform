import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";

/** One-off solo assigned jobs: allow accept until scheduled start + this grace (ms). */
export const ASSIGNED_ACCEPT_GRACE_MS = 30 * 60 * 1000;
export const RECURRING_ACCEPTANCE_OVERDUE_MESSAGE =
  "Acceptance overdue. This recurring job is still assigned to you. Accept the job to continue.";

type OfferExpiryRow = Pick<
  CleanerBookingRow,
  "status" | "cleaner_response_status" | "date" | "time" | "accepted_at" | "is_team_job" |
  "is_recurring_generated" | "billing_type" | "monthly_invoice_id"
>;

function isRecurringAssignment(row: OfferExpiryRow): boolean {
  const billingType = String(row.billing_type ?? "").trim().toLowerCase();
  return row.is_recurring_generated === true || billingType === "recurring_invoice" ||
    billingType === "monthly_contract" || Boolean(String(row.monthly_invoice_id ?? "").trim());
}

function cleanerPastAcceptForExpiry(row: OfferExpiryRow): boolean {
  if (Boolean(String(row.accepted_at ?? "").trim())) return true;
  const raw = row.cleaner_response_status;
  const r = raw == null || raw === "" ? "" : String(raw).trim().toLowerCase();
  return (
    r === CLEANER_RESPONSE.ACCEPTED ||
    r === CLEANER_RESPONSE.ON_MY_WAY ||
    r === CLEANER_RESPONSE.STARTED ||
    r === CLEANER_RESPONSE.COMPLETED
  );
}

/**
 * Assigned **solo** offer where the cleaner never accepted and the scheduled start + grace is in the past.
 * Team and recurring assignments never expire through this rule. Their assignment remains active until explicitly changed.
 * When `start` cannot be parsed from `date`/`time`, returns false (do not expire in-app).
 */
export function assignedOfferPastAcceptanceDeadline(
  row: OfferExpiryRow,
  nowMs: number = Date.now(),
  graceMs: number = ASSIGNED_ACCEPT_GRACE_MS,
): boolean {
  if (row.is_team_job === true || isRecurringAssignment(row)) return false;
  return isUnacceptedAssignmentOverdue(row, nowMs, graceMs);
}

function isUnacceptedAssignmentOverdue(row: OfferExpiryRow, nowMs: number, graceMs: number): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "assigned" && st !== "confirmed" && st !== "offered") return false;
  if (cleanerPastAcceptForExpiry(row)) return false;
  const startMs = jobStartMsJohannesburg(row.date, row.time);
  if (startMs == null) return false;
  return nowMs > startMs + graceMs;
}

/** Warn without hiding the job or recording acceptance on the cleaner's behalf. */
export function recurringAssignmentAcceptanceOverdue(row: OfferExpiryRow, nowMs: number = Date.now()): boolean {
  return isRecurringAssignment(row) && isUnacceptedAssignmentOverdue(row, nowMs, ASSIGNED_ACCEPT_GRACE_MS);
}
