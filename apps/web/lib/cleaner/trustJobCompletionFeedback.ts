import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { isBookingPayoutPaid } from "@/lib/cleaner/cleanerPayoutPaid";

export type TrustJobCompletionFeedback =
  | { kind: "amount"; cents: number; /** After refresh, same source as earnings summary (Johannesburg day). */ todayTotalCents?: number | null }
  | { kind: "processing"; todayTotalCents?: number | null };

/**
 * Cleaner trust copy after a successful **complete** action.
 * Uses only frozen/display cents from the row — no estimates or recomputation.
 */
export function trustJobCompletionFeedbackFromRow(row: CleanerBookingRow): TrustJobCompletionFeedback {
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "completed") return { kind: "processing" };

  const rec = row as Record<string, unknown>;
  const ps = String(rec.payout_status ?? "")
    .trim()
    .toLowerCase();
  const paidMalformed =
    ps === "paid" && !isBookingPayoutPaid({ payout_status: rec.payout_status, payout_paid_at: rec.payout_paid_at });
  if (paidMalformed) return { kind: "processing" };

  const cents = cleanerFacingDisplayEarningsCents(row);
  if (cents != null && cents > 0) return { kind: "amount", cents };
  return { kind: "processing" };
}
