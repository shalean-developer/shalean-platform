/**
 * BILL-INV-002 Phase A — amount / payment-link integrity helpers (no DB migration).
 * Pure functions are safe for client + server; clearing links is server-only.
 */

/** Parse trailing `_b{cents}` from a monthly invoice Paystack reference. */
export function parseBalanceSuffixFromPaystackReference(reference: string): number | null {
  const m = String(reference ?? "")
    .trim()
    .match(/_b(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCents(value: number | null | undefined): number {
  return Math.max(0, Math.round(Number(value ?? 0)));
}

/** True when charge amount equals the invoice remaining balance. */
export function monthlyInvoiceChargeMatchesRemainingBalance(
  amountCents: number,
  balanceCents: number | null | undefined,
): boolean {
  return normalizeCents(amountCents) === normalizeCents(balanceCents);
}

/**
 * True when the stored Paystack reference is bound to the current remaining balance
 * via `_b{cents}` suffix (Phase A freshness check).
 */
export function paystackReferenceMatchesCurrentBalance(
  reference: string | null | undefined,
  balanceCents: number | null | undefined,
): boolean {
  const pref = String(reference ?? "").trim();
  if (!pref) return false;
  const suffix = parseBalanceSuffixFromPaystackReference(pref);
  if (suffix === null) return false;
  return suffix === normalizeCents(balanceCents);
}

export const MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE = "amount_mismatch_quarantined" as const;
