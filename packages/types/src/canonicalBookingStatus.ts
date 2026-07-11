/**
 * Canonical booking **status** vocabulary at UI / lifecycle boundaries.
 *
 * - **DB** remains source of truth (`bookings.status` is plain text; integrity rows exist).
 * - **Reads**: normalize legacy aliases here so admin / cleaner / customer agree on meaning.
 * - **Writes**: admin API maps `confirmed` → `assigned`; keep DB migrations as the hammer for bulk repairs.
 */

/** Legacy marketplace alias — treat everywhere as {@link CANONICAL_ASSIGNMENT_STATUS}. */
export const LEGACY_CONFIRMED_STATUS = "confirmed" as const;

/** Post-pay dispatch bucket (cleaner allocated or race-assigned). */
export const CANONICAL_ASSIGNMENT_STATUS = "assigned" as const;

/** Unpaid booking row reserved for Paystack / recovery. */
export const CANONICAL_PENDING_PAYMENT_STATUS = "pending_payment" as const;

const INTEGRITY_STATUSES = new Set(["payment_mismatch", "payment_reconciliation_required"]);

/**
 * Map DB → canonical lifecycle status string (lowercase).
 * Only **confirmed → assigned** is collapsed; integrity / unpaid statuses stay literal.
 */
export function canonicalDbBookingStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (s === LEGACY_CONFIRMED_STATUS) return CANONICAL_ASSIGNMENT_STATUS;
  return s;
}

export function isBookingIntegrityStatus(raw: string | null | undefined): boolean {
  return INTEGRITY_STATUSES.has(String(raw ?? "").trim().toLowerCase());
}
