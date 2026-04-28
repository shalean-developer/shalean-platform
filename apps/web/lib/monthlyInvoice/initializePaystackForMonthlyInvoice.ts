import "server-only";

import crypto from "crypto";

import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InitializeMonthlyInvoicePaystackResult =
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; error: string };

const PAYABLE_STATUSES = ["draft", "sent", "partially_paid", "overdue"] as const;

/**
 * Creates Paystack checkout for the **remaining** invoice balance (`balance_cents`).
 * First send: `draft` → `sent`. Retries after partial pay: keep `partially_paid` / `overdue`.
 */
export async function initializePaystackForMonthlyInvoice(
  admin: SupabaseClient,
  params: { invoiceId: string; customerEmail: string },
): Promise<InitializeMonthlyInvoicePaystackResult> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, error: "PAYSTACK_SECRET_KEY missing" };
  }

  const email = params.customerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_customer_email" };
  }

  const { data: inv, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, total_amount_cents, amount_paid_cents, balance_cents, status, month")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!inv) return { ok: false, error: "invoice_not_found" };

  const row = inv as {
    id: string;
    customer_id: string;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    status: string | null;
    month: string | null;
  };

  const statusNorm = String(row.status ?? "").toLowerCase();
  if (!PAYABLE_STATUSES.includes(statusNorm as (typeof PAYABLE_STATUSES)[number])) {
    return { ok: false, error: "invoice_not_payable" };
  }

  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  if (balance <= 0) {
    return { ok: false, error: "invoice_nothing_due" };
  }

  const reference = `mi_inv_${crypto.randomUUID()}`;
  const appUrl = getPublicAppUrlBase();
  const callbackUrl = appUrl ? `${appUrl}/account` : undefined;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: balance,
      currency: "ZAR",
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      metadata: {
        shalean_monthly_invoice_id: row.id,
        invoice_month: row.month ?? "",
        customer_user_id: row.customer_id,
        customer_email: email,
        amount_due_cents: String(balance),
      },
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };

  const authUrl = json.data?.authorization_url;
  const ref = json.data?.reference ?? reference;
  if (!json.status || !authUrl || !ref) {
    await reportOperationalIssue("error", "monthly_invoice/paystack_init", json.message || "initialize failed", {
      invoiceId: row.id,
    });
    return { ok: false, error: json.message || "paystack_initialize_failed" };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = statusNorm === "draft" ? "sent" : statusNorm;

  const patch: Record<string, unknown> = {
    paystack_reference: ref,
    payment_link: authUrl,
    status: nextStatus,
    updated_at: nowIso,
  };
  if (statusNorm === "draft") {
    patch.sent_at = nowIso;
    patch.finalized_at = nowIso;
  }

  let upd = admin.from("monthly_invoices").update(patch).eq("id", row.id);
  if (statusNorm === "draft") {
    upd = upd.eq("status", "draft");
  }
  const { error: patchErr } = await upd;

  if (patchErr) {
    return { ok: false, error: patchErr.message };
  }

  return { ok: true, authorizationUrl: authUrl, reference: ref };
}
