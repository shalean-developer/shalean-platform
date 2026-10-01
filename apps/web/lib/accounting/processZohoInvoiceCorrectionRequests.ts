import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshInvoiceStatusFromZoho } from "@/lib/accounting/syncInvoiceMetadata";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getZohoInvoice } from "@/lib/zoho/zohoBooksService";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";

type CreditNoteCreateResponse = {
  creditnote?: {
    creditnote_id?: string;
    creditnote_number?: string;
  };
};

export type ZohoInvoiceCorrectionResult =
  | { ok: true; processed: number; applied: number; skipped: number; failed: number }
  | { ok: false; error: string };

export async function processZohoInvoiceCorrectionRequests(
  admin: SupabaseClient,
  limit = 1,
): Promise<ZohoInvoiceCorrectionResult> {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit || 1)));

  const { data: requests, error: reqErr } = await admin
    .from("monthly_invoice_events")
    .select("id, invoice_id, payload, created_at")
    .eq("kind", "zoho_invoice_correction_requested")
    .order("created_at", { ascending: true })
    .limit(boundedLimit * 5);

  if (reqErr) return { ok: false, error: reqErr.message };

  let processed = 0;
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const request of requests ?? []) {
    if (processed >= boundedLimit) break;
    const requestId = String(request.id ?? "");
    const invoiceId = String(request.invoice_id ?? "");
    if (!requestId || !invoiceId) continue;

    const { data: prior } = await admin
      .from("monthly_invoice_events")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("kind", "zoho_invoice_correction_applied")
      .contains("payload", { request_event_id: requestId })
      .limit(1)
      .maybeSingle();

    if (prior?.id) {
      skipped += 1;
      continue;
    }

    processed += 1;

    const { data: invoice, error: invErr } = await admin
      .from("monthly_invoices")
      .select("id, status, is_closed, total_amount_cents, balance_cents, zoho_invoice_id, zoho_invoice_number")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr || !invoice) {
      failed += 1;
      await logSystemEvent({
        level: "error",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_invoice_load_failed",
        context: { request_event_id: requestId, invoice_id: invoiceId, error: invErr?.message ?? "not_found" },
      });
      continue;
    }

    const localStatus = String(invoice.status ?? "").toLowerCase();
    const localTotalCents = Math.max(0, Math.round(Number(invoice.total_amount_cents ?? 0)));
    const localBalanceCents = Math.max(0, Math.round(Number(invoice.balance_cents ?? 0)));
    const zohoInvoiceId = String(invoice.zoho_invoice_id ?? "").trim();

    if (localStatus !== "paid" || !invoice.is_closed || localBalanceCents !== 0 || !zohoInvoiceId) {
      failed += 1;
      await logSystemEvent({
        level: "warn",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_local_guard_failed",
        context: {
          request_event_id: requestId,
          invoice_id: invoiceId,
          local_status: localStatus,
          local_balance_cents: localBalanceCents,
          has_zoho_invoice: Boolean(zohoInvoiceId),
        },
      });
      continue;
    }

    const zoho = await getZohoInvoice(zohoInvoiceId);
    if (!zoho.ok) {
      failed += 1;
      await logSystemEvent({
        level: "warn",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_lookup_failed",
        context: { request_event_id: requestId, invoice_id: invoiceId, error: zoho.error },
      });
      continue;
    }

    const differenceCents = zoho.totalCents - localTotalCents;
    if (
      differenceCents <= 0 ||
      zoho.balanceCents <= 0 ||
      differenceCents !== zoho.balanceCents ||
      !zoho.customerId
    ) {
      failed += 1;
      await logSystemEvent({
        level: "warn",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_remote_guard_failed",
        context: {
          request_event_id: requestId,
          invoice_id: invoiceId,
          local_total_cents: localTotalCents,
          zoho_total_cents: zoho.totalCents,
          zoho_balance_cents: zoho.balanceCents,
          difference_cents: differenceCents,
        },
      });
      continue;
    }

    const payload =
      request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? (request.payload as Record<string, unknown>)
        : {};
    const actor = String(payload.actor ?? "admin").slice(0, 120);
    const reason = String(
      payload.reason ?? "Correct stale Zoho invoice overstatement to match Shalean source of truth",
    ).slice(0, 500);
    const referenceNumber = `shalean-corr-${invoiceId.slice(0, 8)}-${differenceCents}`;
    const date = String(request.created_at ?? new Date().toISOString()).slice(0, 10);

    try {
      const created = await zohoBooksClient.post<CreditNoteCreateResponse>(
        `/creditnotes?invoice_id=${encodeURIComponent(zohoInvoiceId)}`,
        {
          customer_id: zoho.customerId,
          date,
          reference_number: referenceNumber,
          notes: `Shalean invoice correction for ${invoice.zoho_invoice_number ?? invoiceId}. No customer cash refund.`,
          line_items: [
            {
              invoice_id: zohoInvoiceId,
              name: "Invoice correction",
              description: reason,
              quantity: 1,
              rate: differenceCents / 100,
              product_type: "service",
            },
          ],
        },
      );

      const creditNoteId = String(created.creditnote?.creditnote_id ?? "").trim();
      if (!creditNoteId) throw new Error("zoho_credit_note_missing_id");

      const now = new Date().toISOString();
      await admin.from("monthly_invoice_events").insert({
        invoice_id: invoiceId,
        kind: "zoho_invoice_correction_applied",
        payload: {
          kind: "zoho_invoice_correction_applied",
          at: now,
          actor,
          request_event_id: requestId,
          reason,
          zoho_invoice_id: zohoInvoiceId,
          zoho_invoice_number: invoice.zoho_invoice_number ?? zoho.invoiceNumber,
          zoho_credit_note_id: creditNoteId,
          zoho_credit_note_number: created.creditnote?.creditnote_number ?? null,
          correction_cents: differenceCents,
          local_total_cents: localTotalCents,
          zoho_total_cents_before: zoho.totalCents,
          zoho_balance_cents_before: zoho.balanceCents,
          customer_refund: false,
        },
      });

      await refreshInvoiceStatusFromZoho(admin, "monthly_invoice", invoiceId, zohoInvoiceId);
      applied += 1;

      await logSystemEvent({
        level: "info",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_applied",
        context: {
          request_event_id: requestId,
          invoice_id: invoiceId,
          credit_note_id: creditNoteId,
          correction_cents: differenceCents,
          customer_refund: false,
        },
      });
    } catch (err) {
      failed += 1;
      await logSystemEvent({
        level: "error",
        source: "accounting/zoho_invoice_correction",
        message: "zoho_invoice_correction_failed",
        context: {
          request_event_id: requestId,
          invoice_id: invoiceId,
          error: String(err instanceof Error ? err.message : err),
        },
      });
    }
  }

  return { ok: true, processed, applied, skipped, failed };
}
