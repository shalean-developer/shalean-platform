import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyMonthlyInvoicePayment } from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";
import { findSuccessfulPaystackChargeForMonthlyInvoice } from "@/lib/monthlyInvoice/findSuccessfulPaystackChargeForMonthlyInvoice";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type SyncMonthlyInvoicePaymentResult =
  | {
      ok: true;
      settled: "full" | "partial" | "already_paid" | "duplicate_charge";
      invoiceId: string;
      reference: string;
    }
  | { ok: false; error: string };

export async function syncMonthlyInvoicePaymentFromPaystack(
  admin: SupabaseClient,
  params: { invoiceId: string; paystackReference?: string | null; customerEmail?: string | null },
): Promise<SyncMonthlyInvoicePaymentResult> {
  const invoiceId = params.invoiceId.trim();

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  if (!inv) return { ok: false, error: "invoice_not_found" };

  const row = inv as { id: string; status: string | null };
  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") {
    return { ok: true, settled: "already_paid", invoiceId: row.id, reference: "" };
  }
  if (st === "refunded") return { ok: false, error: "invoice_refunded" };

  const found = await findSuccessfulPaystackChargeForMonthlyInvoice(admin, {
    invoiceId: row.id,
    customerEmail: params.customerEmail,
    overrideReference: params.paystackReference,
  });
  if ("ok" in found) {
    return { ok: false, error: found.error };
  }
  const charge = found;

  const outcome = await applyMonthlyInvoicePayment(admin, {
    reference: charge.reference,
    amountCents: charge.amountCents,
    invoiceIdHint: row.id,
  });

  if (outcome.ok && "skipped" in outcome && outcome.skipped) {
    if (outcome.reason === "already_paid" || outcome.reason === "duplicate_charge") {
      return { ok: true, settled: outcome.reason, invoiceId: row.id, reference: charge.reference };
    }
    return { ok: false, error: "invoice_not_matched_after_verify" };
  }

  if (outcome.ok && "settled" in outcome) {
    await logSystemEvent({
      level: "info",
      source: "monthly_invoice/sync_payment",
      message: "monthly_invoice.sync_payment_applied",
      context: {
        invoice_id: row.id,
        reference: charge.reference,
        settled: outcome.settled,
        amount_cents: charge.amountCents,
      },
    });
    return {
      ok: true,
      settled: outcome.settled,
      invoiceId: row.id,
      reference: charge.reference,
    };
  }

  return { ok: false, error: !outcome.ok ? outcome.error : "sync_failed" };
}
