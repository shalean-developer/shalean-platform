export type InvoiceUiRow = {
  id: string;
  month: string;
  customer_name: string | null;
  customer_id: string;
  status: string;
  total_amount_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  currency_code: string;
  is_overdue: boolean;
  is_closed: boolean;
  due_date: string | null;
  booking_count: number;
  view_count: number;
  display_reference: string;
  sync_hold_reason: string | null;
  date_context: "last_visit" | "due";
};

export function getInvoiceOperationalStatus(
  invoice: Pick<InvoiceUiRow, "status" | "is_overdue" | "balance_cents">,
): string {
  const status = invoice.status.toLowerCase();
  if (status !== "paid" && invoice.balance_cents > 0 && invoice.is_overdue) return "overdue";
  return status;
}

export function getMonthBalanceBreakdown(
  invoices: Array<Pick<InvoiceUiRow, "status" | "balance_cents" | "is_closed">>,
): {
  collectible_cents: number;
  draft_forecast_cents: number;
  open_balance_cents: number;
} {
  let collectible_cents = 0;
  let draft_forecast_cents = 0;
  let open_balance_cents = 0;

  for (const invoice of invoices) {
    if (invoice.is_closed) continue;
    const balance = Math.max(0, Math.round(invoice.balance_cents));
    open_balance_cents += balance;
    const status = invoice.status.toLowerCase();
    if (status === "draft") {
      draft_forecast_cents += balance;
    } else if (["sent", "partially_paid", "overdue"].includes(status)) {
      collectible_cents += balance;
    }
  }

  return { collectible_cents, draft_forecast_cents, open_balance_cents };
}

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildInvoiceCsv(invoices: InvoiceUiRow[]): string {
  const headers = [
    "Invoice",
    "Customer",
    "Customer ID",
    "Billing month",
    "Status",
    "Total",
    "Paid",
    "Balance",
    "Currency",
    "Date context",
    "Date",
    "Bookings",
    "Views",
    "Held reason",
  ];

  const lines = invoices.map((invoice) => {
    const operationalStatus = getInvoiceOperationalStatus(invoice);
    const values: Array<string | number | null> = [
      invoice.display_reference,
      invoice.customer_name,
      invoice.customer_id,
      invoice.month,
      operationalStatus,
      (invoice.total_amount_cents / 100).toFixed(2),
      (invoice.amount_paid_cents / 100).toFixed(2),
      (invoice.balance_cents / 100).toFixed(2),
      invoice.currency_code,
      invoice.date_context === "last_visit" ? "Last visit" : "Due",
      invoice.due_date,
      invoice.booking_count,
      invoice.view_count,
      invoice.sync_hold_reason,
    ];
    return values.map(csvCell).join(",");
  });

  return [headers.join(","), ...lines].join("\r\n");
}
