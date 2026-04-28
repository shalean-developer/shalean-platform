export type MonthlyInvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue";

export function customerMonthlyInvoiceStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  switch (s as MonthlyInvoiceStatus) {
    case "draft":
      return "In progress";
    case "sent":
      return "Invoice sent";
    case "partially_paid":
      return "Part paid";
    case "overdue":
      return "Overdue";
    case "paid":
      return "Paid";
    default:
      return s ? s.replace(/_/g, " ") : "—";
  }
}
