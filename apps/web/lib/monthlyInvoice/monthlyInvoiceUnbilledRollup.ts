import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type UnbilledMonthlyBookingRow = {
  id: string;
  date: string | null;
  totalPaidZar: number;
  monthlyInvoiceId: string | null;
  invoiceStatus: string | null;
};

function numZar(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return 0;
}

/**
 * Recurring-generated monthly bookings awaiting invoice cycle (`payment_status = pending_monthly`).
 * Includes `invoiceStatus` when `monthly_invoice_id` is set (FK embed).
 */
export async function listUnbilledMonthlyBookingsForCustomer(
  admin: SupabaseClient,
  customerId: string,
): Promise<UnbilledMonthlyBookingRow[]> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, date, total_paid_zar, monthly_invoice_id, monthly_invoices(status)")
    .eq("user_id", customerId)
    .eq("payment_status", "pending_monthly")
    .eq("is_monthly_billing_booking", true);

  if (error || !data) return [];

  return data.map((raw) => {
    const row = raw as {
      id: string;
      date?: string | null;
      total_paid_zar?: unknown;
      monthly_invoice_id?: string | null;
      monthly_invoices?: { status?: string } | null;
    };
    const inv = row.monthly_invoices;
    return {
      id: String(row.id),
      date: row.date != null ? String(row.date) : null,
      totalPaidZar: numZar(row.total_paid_zar),
      monthlyInvoiceId: row.monthly_invoice_id != null ? String(row.monthly_invoice_id) : null,
      invoiceStatus: inv && typeof inv.status === "string" ? inv.status : null,
    };
  });
}

/** Sum ZAR for unbilled monthly rows (optionally only draft invoices). */
export async function sumUnbilledMonthlyZarForCustomer(
  admin: SupabaseClient,
  customerId: string,
  opts?: { draftInvoiceOnly?: boolean },
): Promise<number> {
  const rows = await listUnbilledMonthlyBookingsForCustomer(admin, customerId);
  const draftOnly = opts?.draftInvoiceOnly === true;
  return rows.reduce((acc, r) => {
    if (draftOnly && r.monthlyInvoiceId) {
      const st = (r.invoiceStatus ?? "").toLowerCase();
      if (st !== "draft") return acc;
    }
    return acc + r.totalPaidZar;
  }, 0);
}

/** Read canonical cents + booking count from `monthly_invoices` (maintained by DB triggers). */
export async function getMonthlyInvoiceRollup(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{
  id: string;
  customerId: string;
  month: string;
  status: string;
  totalAmountCents: number;
  totalBookings: number;
} | null> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, total_bookings")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    customer_id: string;
    month: string;
    status: string;
    total_amount_cents?: number | null;
    total_bookings?: number | null;
  };
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    month: String(row.month),
    status: String(row.status),
    totalAmountCents: Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))),
    totalBookings: Math.max(0, Math.round(Number(row.total_bookings ?? 0))),
  };
}
