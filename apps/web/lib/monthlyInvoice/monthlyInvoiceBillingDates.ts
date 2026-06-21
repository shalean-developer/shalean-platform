const MONTH_YM = /^\d{4}-\d{2}$/;

/** Zoho / display invoice date: 1st of the billing month. */
export function billingMonthInvoiceDate(month: string): string {
  const ym = String(month ?? "").trim();
  if (!MONTH_YM.test(ym)) return ym;
  return `${ym}-01`;
}

/**
 * Zoho Books dates for a monthly invoice.
 * - Invoice date: 1st of billing month.
 * - Due date: last scheduled visit while draft; actual payment due date once finalized.
 */
export function zohoDatesForMonthlyInvoice(
  month: string,
  dueDateYmd?: string | null,
): { invoiceDate: string; dueDate: string } {
  const ym = String(month ?? "").trim();
  const invoiceDate = billingMonthInvoiceDate(ym);
  const dueDate =
    dueDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dueDateYmd) ? dueDateYmd : invoiceDate;
  return { invoiceDate, dueDate };
}
