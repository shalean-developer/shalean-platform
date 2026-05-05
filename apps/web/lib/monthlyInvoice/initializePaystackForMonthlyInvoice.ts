import "server-only";

import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { monthlyInvoicePaystackReferenceForInitialize } from "@/lib/monthlyInvoice/monthlyInvoiceStablePaystackReference";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InitializeMonthlyInvoicePaystackResult =
  | { ok: true; authorizationUrl: string; reference: string; reused?: boolean }
  | { ok: false; error: string };

const PAYABLE_STATUSES = ["draft", "sent", "partially_paid", "overdue"] as const;

type InvoiceRow = {
  id: string;
  customer_id: string;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  balance_cents: number | null;
  status: string | null;
  month: string | null;
  paystack_reference: string | null;
  payment_link: string | null;
  sent_at: string | null;
};

function isDuplicatePaystackReferenceMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("duplicate") || m.includes("already exist");
}

async function loadInvoiceRow(admin: SupabaseClient, invoiceId: string) {
  return admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, total_amount_cents, amount_paid_cents, balance_cents, status, month, paystack_reference, payment_link, sent_at",
    )
    .eq("id", invoiceId)
    .maybeSingle();
}

function tryReuseExistingInitialize(row: InvoiceRow & { reference: string }): InitializeMonthlyInvoicePaystackResult | null {
  const statusNorm = String(row.status ?? "").toLowerCase();
  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  if (balance <= 0) return null;

  const link = String(row.payment_link ?? "").trim();
  const pref = String(row.paystack_reference ?? "").trim();
  if (!link || !pref) return null;

  if (statusNorm !== "draft") return null;

  if (pref === row.reference || pref.startsWith("mi_inv_")) {
    return { ok: true, authorizationUrl: link, reference: pref, reused: true };
  }

  return null;
}

type PersistRefResult = { ok: true; reload?: true } | { ok: false; error: string };

/**
 * Persist Paystack reference **before** `transaction/initialize` so crashes mid-flight keep a deterministic ref on the row.
 * DB uniqueness on non-null `paystack_reference` prevents cross-invoice collisions (column UNIQUE from bootstrap migration).
 */
async function persistMonthlyInvoicePaystackReferenceBeforeInit(
  admin: SupabaseClient,
  row: InvoiceRow,
  reference: string,
): Promise<PersistRefResult> {
  const statusNorm = String(row.status ?? "").toLowerCase();
  const pref = String(row.paystack_reference ?? "").trim();
  const link = String(row.payment_link ?? "").trim();

  if (pref === reference) return { ok: true };

  if (pref && pref !== reference) {
    if (link) return { ok: false, error: "invoice_paystack_reference_conflict" };
    if (statusNorm !== "draft") {
      return { ok: false, error: "invoice_paystack_reference_conflict_non_draft" };
    }
    const { error } = await admin
      .from("monthly_invoices")
      .update({ paystack_reference: reference })
      .eq("id", row.id)
      .eq("status", "draft")
      .is("payment_link", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (statusNorm === "draft") {
    const { data, error } = await admin
      .from("monthly_invoices")
      .update({ paystack_reference: reference })
      .eq("id", row.id)
      .eq("status", "draft")
      .is("paystack_reference", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: true, reload: true };
    return { ok: true };
  }

  if (statusNorm === "sent" || statusNorm === "partially_paid" || statusNorm === "overdue") {
    const { error } = await admin
      .from("monthly_invoices")
      .update({ paystack_reference: reference })
      .eq("id", row.id)
      .in("status", ["sent", "partially_paid", "overdue"]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false, error: "invoice_paystack_reference_persist_unsupported_status" };
}

/**
 * Creates Paystack checkout for the **remaining** invoice balance (`balance_cents`).
 * First send: `draft` → `sent`. Retries after partial pay: keep `partially_paid` / `overdue`.
 *
 * Persists `paystack_reference` **before** calling Paystack (crash-safe). Uses deterministic refs;
 * duplicate Paystack responses recover via DB row + reuse paths.
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

  let { data: inv, error } = await loadInvoiceRow(admin, params.invoiceId);

  if (error) return { ok: false, error: error.message };
  if (!inv) return { ok: false, error: "invoice_not_found" };

  let row = inv as InvoiceRow;

  const statusNorm = String(row.status ?? "").toLowerCase();
  if (!PAYABLE_STATUSES.includes(statusNorm as (typeof PAYABLE_STATUSES)[number])) {
    return { ok: false, error: "invoice_not_payable" };
  }

  const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  if (balance <= 0) {
    return { ok: false, error: "invoice_nothing_due" };
  }

  const reference = monthlyInvoicePaystackReferenceForInitialize(row);

  const reuse = tryReuseExistingInitialize({ ...row, reference });
  if (reuse) return reuse;

  const persisted = await persistMonthlyInvoicePaystackReferenceBeforeInit(admin, row, reference);
  if (!persisted.ok) return { ok: false, error: persisted.error };
  if (persisted.reload) {
    const reload = await loadInvoiceRow(admin, params.invoiceId);
    if (reload.error || !reload.data) return { ok: false, error: reload.error?.message ?? "invoice_not_found" };
    row = reload.data as InvoiceRow;
    const reuseAfter = tryReuseExistingInitialize({ ...row, reference });
    if (reuseAfter) return reuseAfter;
    if (String(row.paystack_reference ?? "").trim() !== reference) {
      return { ok: false, error: "invoice_paystack_reference_race" };
    }
  }

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

  const msg = String(json.message ?? "");

  if (!json.status || !json.data?.authorization_url || !json.data?.reference) {
    if (isDuplicatePaystackReferenceMessage(msg)) {
      const { data: again } = await loadInvoiceRow(admin, params.invoiceId);
      if (again) {
        const r2 = again as InvoiceRow;
        const dupReuse = tryReuseExistingInitialize({ ...r2, reference });
        if (dupReuse) return dupReuse;
        const link2 = String(r2.payment_link ?? "").trim();
        const pref2 = String(r2.paystack_reference ?? "").trim();
        if (link2 && pref2) {
          return { ok: true, authorizationUrl: link2, reference: pref2, reused: true };
        }
      }
    }

    await reportOperationalIssue("error", "monthly_invoice/paystack_init", msg || "initialize failed", {
      invoiceId: row.id,
    });
    return { ok: false, error: msg || "paystack_initialize_failed" };
  }

  const authUrl = json.data.authorization_url;
  const ref = json.data.reference ?? reference;

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
  const { data: updatedRows, error: patchErr } = await upd.select("id");

  if (patchErr) {
    return { ok: false, error: patchErr.message };
  }

  if (statusNorm === "draft" && (!updatedRows?.length || updatedRows.length < 1)) {
    const { data: raceRow } = await loadInvoiceRow(admin, row.id);
    if (raceRow) {
      const rr = raceRow as InvoiceRow;
      const raceReuse = tryReuseExistingInitialize({ ...rr, reference });
      if (raceReuse) return raceReuse;
      const linkR = String(rr.payment_link ?? "").trim();
      const prefR = String(rr.paystack_reference ?? "").trim();
      if (linkR && prefR) {
        return { ok: true, authorizationUrl: linkR, reference: prefR, reused: true };
      }
    }
    return { ok: false, error: "invoice_finalize_race_no_row_updated" };
  }

  return { ok: true, authorizationUrl: authUrl, reference: ref };
}
