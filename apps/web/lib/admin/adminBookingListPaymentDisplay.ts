/**
 * Ops-facing labels for admin booking list (uses DB `payment_status` + `status`, not payment-link heuristics).
 */
export function adminBookingPaymentPrimaryLabel(row: {
  status?: string | null;
  payment_status?: string | null;
}): string {
  const ps = String(row.payment_status ?? "").trim().toLowerCase();
  const st = String(row.status ?? "").trim().toLowerCase();
  if (ps === "pending_monthly") return "Billed monthly";
  if (st === "pending_payment") return "Awaiting payment";
  if (ps === "success") return "Paid";
  if (ps === "failed") return "Failed";
  if (ps === "pending") return "Payment pending";
  if (ps) return ps.replace(/_/g, " ");
  if (st === "payment_expired") return "Payment expired";
  return "—";
}

export function adminBookingInvoiceHint(monthlyInvoiceId: string | null | undefined): string | null {
  const id = typeof monthlyInvoiceId === "string" ? monthlyInvoiceId.trim() : "";
  return id ? "Included in invoice" : null;
}
