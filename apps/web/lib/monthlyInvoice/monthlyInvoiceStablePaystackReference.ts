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

/**
 * After ops reopen `sent` → `draft`, the original stable ref may already exist on Paystack.
 * Reopen stamps `paystack_reference` to `{base}_r{ms}` so the next initialize uses a fresh ref.
 */
export function monthlyInvoiceReopenedDraftPaystackReference(
  invoiceId: string,
  monthYm: string | null | undefined,
  reopenMs: number = Date.now(),
): string {
  return `${stableMonthlyInvoicePaystackReference(invoiceId, monthYm)}_r${reopenMs}`;
}

export function monthlyInvoicePaystackReferenceForInitialize(row: {
  id: string;
  month: string | null;
  status: string | null;
  balance_cents: number | null;
  paystack_reference?: string | null;
}): string {
  const base = stableMonthlyInvoicePaystackReference(row.id, row.month);
  const st = String(row.status ?? "").toLowerCase();
  if (st === "draft") {
    const existing = String(row.paystack_reference ?? "").trim();
    if (existing.startsWith(`${base}_r`)) return existing;
    return base;
  }
  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  return `${base}_b${balance}`;
}
