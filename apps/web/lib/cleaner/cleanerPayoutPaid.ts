/**
 * Single-source “paid” for cleaner-facing surfaces: status + timestamp (matches DB invariants).
 */
export function isBookingPayoutPaid(row: {
  payout_status?: unknown;
  payout_paid_at?: unknown;
}): boolean {
  const ps = String(row.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (ps !== "paid") return false;
  const at = row.payout_paid_at;
  return typeof at === "string" && at.trim().length > 0;
}
