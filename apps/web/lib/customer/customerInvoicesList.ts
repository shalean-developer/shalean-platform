import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerMonthlyInvoiceListItem = {
  id: string;
  month: string;
  status: string | null;
  dueDate: string | null;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceCents: number;
  isOverdue: boolean;
  isClosed: boolean;
  paymentLink: string | null;
  paystackReference: string | null;
  currencyCode: string | null;
  totalBookings: number | null;
};

export type CustomerPerVisitInvoiceListItem = {
  bookingId: string;
  serviceName: string;
  date: string;
  amountZar: number;
  status: "paid";
  createdAt: string;
  hasPdf: boolean;
};

export type CustomerInvoicesListDto = {
  monthly: CustomerMonthlyInvoiceListItem[];
  perVisit: CustomerPerVisitInvoiceListItem[];
};

const MONTHLY_SELECT = [
  "id",
  "month",
  "status",
  "due_date",
  "total_amount_cents",
  "amount_paid_cents",
  "balance_cents",
  "is_overdue",
  "is_closed",
  "payment_link",
  "paystack_reference",
  "currency_code",
  "total_bookings",
].join(",");

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lists monthly invoices + paid per-visit bookings for the authenticated customer.
 * Always filters by customer_id / user_id from the JWT — never from the client body.
 */
export async function loadCustomerInvoicesList(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; data: CustomerInvoicesListDto } | { ok: false; error: string }> {
  const [{ data: monthlyRows, error: monthlyErr }, { data: bookingRows, error: bookingErr }] =
    await Promise.all([
      admin
        .from("monthly_invoices")
        .select(MONTHLY_SELECT)
        .eq("customer_id", userId)
        .order("month", { ascending: false })
        .limit(120),
      admin
        .from("bookings")
        .select(
          "id, service, date, total_paid_zar, total_price, status, payment_status, created_at, zoho_invoice_id, is_monthly_billing_booking, user_id",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (monthlyErr) return { ok: false, error: monthlyErr.message };
  if (bookingErr) return { ok: false, error: bookingErr.message };

  const monthly: CustomerMonthlyInvoiceListItem[] = (monthlyRows ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      month: String(r.month ?? ""),
      status: r.status != null ? String(r.status) : null,
      dueDate: r.due_date != null ? String(r.due_date) : null,
      totalAmountCents: num(r.total_amount_cents),
      amountPaidCents: num(r.amount_paid_cents),
      balanceCents: num(r.balance_cents),
      isOverdue: r.is_overdue === true,
      isClosed: r.is_closed === true,
      paymentLink: typeof r.payment_link === "string" ? r.payment_link : null,
      paystackReference: typeof r.paystack_reference === "string" ? r.paystack_reference : null,
      currencyCode: typeof r.currency_code === "string" ? r.currency_code : null,
      totalBookings: r.total_bookings != null ? num(r.total_bookings) : null,
    };
  });

  const perVisit: CustomerPerVisitInvoiceListItem[] = [];
  for (const raw of bookingRows ?? []) {
    const r = raw as Record<string, unknown>;
    const paymentStatus = String(r.payment_status ?? "").toLowerCase();
    const status = String(r.status ?? "").toLowerCase();
    const isMonthly =
      r.is_monthly_billing_booking === true || paymentStatus === "pending_monthly";
    if (isMonthly) continue;
    if (
      status === "pending_payment" ||
      status === "cancelled" ||
      status === "failed" ||
      status === "payment_mismatch" ||
      status === "payment_reconciliation_required"
    ) {
      continue;
    }
    const amountZar = num(r.total_paid_zar) || num(r.total_price);
    if (!(paymentStatus === "success" || amountZar > 0)) continue;
    perVisit.push({
      bookingId: String(r.id),
      serviceName: typeof r.service === "string" && r.service.trim() ? r.service.trim() : "Cleaning",
      date: typeof r.date === "string" ? r.date : "",
      amountZar,
      status: "paid",
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      hasPdf: Boolean(r.zoho_invoice_id),
    });
  }

  return { ok: true, data: { monthly, perVisit } };
}
