import { formatCurrency, formatDate } from "@/lib/admin/invoices/invoiceAdminFormatters";

export type InvoiceBookingOption = {
  id: string;
  date: string | null;
  service: string | null;
  amountCents: number;
};

function bookingAmountCents(b: Record<string, unknown>): number {
  const zar = b.total_paid_zar;
  if (typeof zar === "number" && Number.isFinite(zar)) return Math.max(0, Math.round(zar * 100));
  const cents = b.amount_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.max(0, Math.round(cents));
  return 0;
}

export function invoiceBookingOptionsFromRows(bookings: Record<string, unknown>[]): InvoiceBookingOption[] {
  return bookings
    .map((b) => ({
      id: String(b.id ?? ""),
      date: (b.date as string | null) ?? null,
      service: (b.service as string | null) ?? null,
      amountCents: bookingAmountCents(b),
    }))
    .filter((o) => o.id)
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
}

export function formatInvoiceBookingOptionLabel(option: InvoiceBookingOption, currencyCode: string): string {
  const parts = [formatDate(option.date)];
  if (option.service) parts.push(option.service);
  parts.push(formatCurrency(option.amountCents, currencyCode));
  return parts.join(" · ");
}
