import "server-only";

/**
 * Stable Paystack `reference` for a monthly invoice's **first** finalize (`draft` → `sent`):
 * same id + bucket month → same string across retries (Paystack duplicate-ref handling + our DB idempotency).
 *
 * Retries when invoice is already `sent` / `partially_paid` / `overdue` use {@link monthlyInvoicePaystackReferenceForInitialize} instead
 * so balance changes get a fresh reference.
 */
export function stableMonthlyInvoicePaystackReference(invoiceId: string, monthYm: string | null | undefined): string {
  const ym = String(monthYm ?? "").trim();
  const monthCompact = /^\d{4}-\d{2}$/.test(ym) ? `${ym.slice(0, 4)}${ym.slice(5, 7)}` : "000000";
  return `mi_inv_${invoiceId}_${monthCompact}`;
}

export function monthlyInvoicePaystackReferenceForInitialize(row: {
  id: string;
  month: string | null;
  status: string | null;
  balance_cents: number | null;
}): string {
  const base = stableMonthlyInvoicePaystackReference(row.id, row.month);
  const st = String(row.status ?? "").toLowerCase();
  if (st === "draft") return base;
  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  return `${base}_b${balance}`;
}
