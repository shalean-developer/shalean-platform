import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";

/** Solo assigned jobs: allow accept until scheduled start + this grace (ms). */
export const ASSIGNED_ACCEPT_GRACE_MS = 30 * 60 * 1000;

type OfferExpiryRow = Pick<CleanerBookingRow, "status" | "cleaner_response_status" | "date" | "time" | "accepted_at">;

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
 * Assigned solo offer where the cleaner never accepted and the scheduled start + grace is in the past.
 * When `start` cannot be parsed from `date`/`time`, returns false (do not expire in-app).
 */
export function assignedOfferPastAcceptanceDeadline(
  row: OfferExpiryRow,
  nowMs: number = Date.now(),
  graceMs: number = ASSIGNED_ACCEPT_GRACE_MS,
): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "assigned" && st !== "confirmed") return false;
  if (cleanerPastAcceptForExpiry(row)) return false;
  const startMs = jobStartMsJohannesburg(row.date, row.time);
  if (startMs == null) return false;
  return nowMs > startMs + graceMs;
}
