/**
 * Allocates the per-booking `amount_paid_cents` value to write when a monthly
 * invoice settles. Source of truth for **all three** monthly settlement paths:
 *
 * - `lib/monthlyInvoice/finalizeDueMonthlyInvoices.ts` (zero-amount auto-close)
 * - `lib/monthlyInvoice/applyMonthlyInvoicePayment.ts` (Paystack webhook charge.success)
 * - `lib/monthlyInvoice/markMonthlyInvoicePaidManual.ts` (admin manual mark-paid)
 *
 * Rule (canonical, established by `finalizeDueMonthlyInvoices.ts:166-179` and
 * `markMonthlyInvoicePaidManual.ts:116-128`):
 *   1. Prefer the booking's own line amount (`total_paid_zar * 100`) when > 0.
 *   2. Otherwise fall back to the row's existing `amount_paid_cents` (preserves
 *      any earlier deposit / Paystack partial settlement).
 *   3. Result is always a non-negative integer in cents.
 *
 * Production Readiness Audit H-1 prompted extracting this helper because
 * `applyMonthlyInvoicePayment.ts` previously read only `amount_paid_cents` and
 * therefore wrote `0` for the steady-state pre-settlement value, leaving
 * `payment_status='success' AND amount_paid_cents=0` rows downstream of the
 * Paystack webhook. The helper preserves the existing behaviour of the other
 * two paths exactly (see `monthlyChildAllocationConvergence.test.ts`).
 *
 * Pure / synchronous / has no Supabase dependency on purpose so it can be
 * unit-tested without a client and reused in any future settlement path.
 */
export type MonthlyChildAllocationRow = {
  total_paid_zar?: number | string | null;
  amount_paid_cents?: number | string | null;
};

export function allocateMonthlyChildPaymentCents(row: MonthlyChildAllocationRow): number {
  const lineCents = Math.max(0, Math.round(Number(row.total_paid_zar ?? 0) * 100));
  if (Number.isFinite(lineCents) && lineCents > 0) {
    return lineCents;
  }
  const existing = Number(row.amount_paid_cents ?? 0);
  if (Number.isFinite(existing) && existing > 0) {
    return Math.max(0, Math.round(existing));
  }
  return 0;
}
