/** Closed or voided invoices must never reopen a customer payment session. */
export function isMonthlyInvoiceCollectible(invoice: {
  status: string | null;
  is_closed: boolean | null;
  balance_cents: number | null;
}): boolean {
  if (invoice.is_closed === true) return false;
  if (!["draft", "sent", "partially_paid", "overdue"].includes(String(invoice.status ?? "").toLowerCase())) return false;
  const balance = Number(invoice.balance_cents ?? 0);
  return Number.isFinite(balance) && balance > 0;
}
