/**
 * Zoho invoice total for a monthly invoice row.
 * Paid/closed rows often have balance_cents=0 while total_amount_cents holds the bill.
 */
export function resolveMonthlyInvoiceZohoTotalCents(row: {
  status?: string | null;
  total_amount_cents?: number | null;
  balance_cents?: number | null;
}): number {
  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const balanceRaw = row.balance_cents;
  const balance =
    balanceRaw == null ? null : Math.max(0, Math.round(Number(balanceRaw)));
  const status = String(row.status ?? "").toLowerCase();

  if (["paid", "partially_paid", "overdue"].includes(status)) {
    return total;
  }

  if (balance != null && balance > 0) return balance;
  return total;
}

export function monthlyInvoiceZohoSyncErrorMessage(error: string): string {
  switch (error) {
    case "zero_balance":
      return "Invoice total is zero — nothing to send to Zoho.";
    case "zoho_not_configured":
      return "Zoho is not configured on this server.";
    case "customer_contact_unresolved":
    case "customer_name_unresolved":
      return "Customer contact could not be resolved for Zoho.";
    case "monthly_invoice_not_found":
      return "Monthly invoice not found.";
    default:
      return error.replace(/_/g, " ");
  }
}
