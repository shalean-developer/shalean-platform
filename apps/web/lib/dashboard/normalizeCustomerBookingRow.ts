import type { BookingRow } from "@/lib/dashboard/types";

export function normalizeCleanerJoin(row: BookingRow): BookingRow {
  const raw = row as BookingRow & { cleaners?: unknown };
  const c = raw.cleaners;
  if (Array.isArray(c)) {
    return { ...row, cleaners: (c[0] as BookingRow["cleaners"]) ?? null };
  }
  return row;
}

export function normalizeMonthlyInvoiceJoin(row: BookingRow): BookingRow {
  const raw = row as BookingRow & { monthly_invoices?: unknown };
  const mi = raw.monthly_invoices;
  if (Array.isArray(mi)) {
    return { ...row, monthly_invoices: (mi[0] as BookingRow["monthly_invoices"]) ?? null };
  }
  return row;
}

export function normalizeCustomerBookingRow(row: BookingRow): BookingRow {
  return normalizeMonthlyInvoiceJoin(normalizeCleanerJoin(row));
}
