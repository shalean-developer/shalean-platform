import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";

/** Prefer an open invoice (not fully paid), else the latest month by `YYYY-MM`. */
export function pickDashboardInvoiceSummary(invoices: CustomerMonthlyInvoiceRow[]): CustomerMonthlyInvoiceRow | null {
  if (!invoices.length) return null;
  const sorted = [...invoices].sort((a, b) => b.month.localeCompare(a.month));
  const open = sorted.filter((i) => i.status !== "paid");
  return open[0] ?? sorted[0] ?? null;
}
