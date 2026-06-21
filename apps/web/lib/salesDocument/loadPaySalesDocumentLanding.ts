import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

function refsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type PaySalesDocumentLandingOk = {
  ok: true;
  documentId: string;
  customerName: string;
  description: string;
  amountZar: number;
  authorizationUrl: string;
  payment_link_expires_at: string | null;
};

export type PaySalesDocumentLandingErr = {
  ok: false;
  httpStatus: number;
  error: string;
};

export async function loadPaySalesDocumentLanding(
  documentId: string,
  ref: string,
): Promise<PaySalesDocumentLandingOk | PaySalesDocumentLandingErr> {
  const id = documentId.trim();
  const reference = ref.trim();
  if (!id || !reference) {
    return { ok: false, httpStatus: 400, error: "Missing document id or payment reference." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, httpStatus: 503, error: "Service unavailable." };
  }

  const { data: row, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, customer_name, line_items, total_cents, balance_cents, paystack_reference, payment_link, payment_link_expires_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    return { ok: false, httpStatus: 404, error: "We could not find this invoice." };
  }

  const r = row as Record<string, unknown>;
  if (String(r.document_type ?? "") !== "invoice") {
    return { ok: false, httpStatus: 400, error: "This document is not payable online." };
  }

  const paystackRef = typeof r.paystack_reference === "string" ? r.paystack_reference : "";
  if (!paystackRef || !refsMatch(paystackRef, reference)) {
    return { ok: false, httpStatus: 403, error: "Invalid payment reference." };
  }

  const status = String(r.status ?? "").toLowerCase();
  if (status === "paid") {
    return { ok: false, httpStatus: 410, error: "This invoice has already been paid." };
  }
  if (!["sent", "accepted"].includes(status)) {
    return {
      ok: false,
      httpStatus: 410,
      error: "This invoice is not open for payment.",
    };
  }

  const balance = Math.max(0, Math.round(Number(r.balance_cents ?? 0)));
  if (balance <= 0) {
    return { ok: false, httpStatus: 410, error: "Nothing is due on this invoice." };
  }

  const expiresAt =
    typeof r.payment_link_expires_at === "string" ? r.payment_link_expires_at : null;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, httpStatus: 410, error: "This payment link has expired." };
  }

  const paymentLink = typeof r.payment_link === "string" ? r.payment_link : "";
  if (!paymentLink) {
    return { ok: false, httpStatus: 410, error: "Payment link is not available." };
  }

  const lineItems = Array.isArray(r.line_items) ? r.line_items : [];
  const firstLine =
    lineItems[0] && typeof lineItems[0] === "object"
      ? String((lineItems[0] as { description?: string }).description ?? "")
      : "";
  const description = firstLine || "Shalean invoice";

  return {
    ok: true,
    documentId: id,
    customerName: String(r.customer_name ?? "Customer"),
    description,
    amountZar: balance / 100,
    authorizationUrl: paymentLink,
    payment_link_expires_at: expiresAt,
  };
}
