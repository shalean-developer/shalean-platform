import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

function refsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type PayMonthlyInvoiceLandingOk = {
  ok: true;
  invoiceId: string;
  monthLabel: string;
  amountZar: number;
  authorizationUrl: string;
};

export type PayMonthlyInvoiceLandingErr = {
  ok: false;
  httpStatus: number;
  error: string;
};

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function loadPayMonthlyInvoiceLanding(
  invoiceId: string,
  ref: string,
): Promise<PayMonthlyInvoiceLandingOk | PayMonthlyInvoiceLandingErr> {
  const id = invoiceId.trim();
  const reference = ref.trim();
  if (!id || !reference) {
    return { ok: false, httpStatus: 400, error: "Missing invoice id or payment reference." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, httpStatus: 503, error: "Service unavailable." };
  }

  const { data: row, error } = await admin
    .from("monthly_invoices")
    .select("id, month, status, balance_cents, paystack_reference, payment_link, customer_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    return { ok: false, httpStatus: 404, error: "We could not find this invoice." };
  }

  const r = row as Record<string, unknown>;
  const paystackRef = typeof r.paystack_reference === "string" ? r.paystack_reference : "";
  if (!paystackRef || !refsMatch(paystackRef, reference)) {
    return { ok: false, httpStatus: 403, error: "Invalid payment reference." };
  }

  const status = String(r.status ?? "").toLowerCase();
  if (status === "paid") {
    return { ok: false, httpStatus: 410, error: "This invoice has already been paid." };
  }
  if (!["draft", "sent", "partially_paid", "overdue"].includes(status)) {
    return { ok: false, httpStatus: 410, error: "This invoice is not open for payment." };
  }

  const balance = Math.max(0, Math.round(Number(r.balance_cents ?? 0)));
  if (balance <= 0) {
    return { ok: false, httpStatus: 410, error: "Nothing is due on this invoice." };
  }

  let paymentLink = typeof r.payment_link === "string" ? r.payment_link.trim() : "";
  if (!paymentLink) {
    const { resolveMonthlyInvoiceCustomerEmail } = await import(
      "@/lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail"
    );
    const { initializePaystackForMonthlyInvoice } = await import(
      "@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice"
    );
    const customerId = typeof r.customer_id === "string" ? r.customer_id : "";
    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId,
      invoiceId: id,
    });
    if (!email) {
      return { ok: false, httpStatus: 410, error: "Payment link is not available." };
    }
    const init = await initializePaystackForMonthlyInvoice(admin, {
      invoiceId: id,
      customerEmail: email,
    });
    if (!init.ok || !init.authorizationUrl?.trim()) {
      return {
        ok: false,
        httpStatus: 503,
        error:
          "We could not start the secure payment checkout. Your invoice is safe and no payment was taken. Please try again.",
      };
    }
    paymentLink = init.authorizationUrl.trim();
  }

  const month = typeof r.month === "string" ? r.month : "";

  return {
    ok: true,
    invoiceId: id,
    monthLabel: formatMonthLabel(month),
    amountZar: balance / 100,
    authorizationUrl: paymentLink,
  };
}
