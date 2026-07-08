import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { monthlyInvoiceReopenedDraftPaystackReference } from "@/lib/monthlyInvoice/monthlyInvoiceStablePaystackReference";
import { refreshDraftMonthlyInvoiceDueDate } from "@/lib/monthlyInvoice/refreshDraftMonthlyInvoiceDueDate";
import { voidZohoInvoice } from "@/lib/zoho/zohoBooksService";
import { lastDayYmdOfInvoiceMonth } from "@/lib/recurring/johannesburgCalendar";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type ReopenMonthlyInvoiceToDraftResult =
  | { ok: true; invoiceId: string; attachedBookingIds: string[]; zohoVoided: boolean }
  | { ok: false; error: string };

/**
 * Ops recovery: move an unpaid `sent` monthly invoice back to `draft` so more
 * on-demand visits can attach and finalize waits for month-end again.
 *
 * Clears Paystack link / email claim, rotates `paystack_reference`, and voids
 * the linked Zoho invoice when present (non-fatal if Zoho void fails).
 */
export async function reopenMonthlyInvoiceToDraft(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    actor?: string;
    source: string;
    reason?: string;
    attachOrphanBookingsInMonth?: boolean;
  },
): Promise<ReopenMonthlyInvoiceToDraftResult> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, amount_paid_cents, is_closed, zoho_invoice_id")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  const row = inv as {
    id: string;
    customer_id: string;
    month: string;
    status: string | null;
    amount_paid_cents: number | null;
    is_closed: boolean | null;
    zoho_invoice_id: string | null;
  } | null;

  if (!row) return { ok: false, error: "not_found" };
  if (Boolean(row.is_closed)) return { ok: false, error: "invoice_closed" };

  const status = String(row.status ?? "").toLowerCase();
  if (status === "draft") {
    return { ok: true, invoiceId: row.id, attachedBookingIds: [], zohoVoided: false };
  }
  if (status !== "sent" && status !== "overdue") {
    return { ok: false, error: `unsupported_status:${status}` };
  }
  if (Math.round(Number(row.amount_paid_cents ?? 0)) > 0) {
    return { ok: false, error: "invoice_has_payments" };
  }

  const reopenMs = Date.now();
  const rotatedRef = monthlyInvoiceReopenedDraftPaystackReference(row.id, row.month, reopenMs);
  const monthEndDue = lastDayYmdOfInvoiceMonth(row.month);
  const nowIso = new Date().toISOString();

  let zohoVoided = false;
  const zohoId = String(row.zoho_invoice_id ?? "").trim();
  if (zohoId) {
    const voided = await voidZohoInvoice(zohoId);
    zohoVoided = voided.ok;
    if (!voided.ok) {
      await reportOperationalIssue("warn", params.source, "zoho_void_failed_on_reopen", {
        invoiceId: row.id,
        zohoInvoiceId: zohoId,
        error: voided.error,
      });
    }
  }

  const { data: updated, error: upErr } = await admin
    .from("monthly_invoices")
    .update({
      status: "draft",
      sent_at: null,
      finalized_at: null,
      payment_link: null,
      paystack_reference: rotatedRef,
      initial_invoice_email_dispatch_claimed: false,
      zoho_invoice_id: null,
      zoho_invoice_number: null,
      is_overdue: false,
      due_date: monthEndDue,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", status)
    .select("id");

  if (upErr) return { ok: false, error: upErr.message };
  if (!updated?.length) return { ok: false, error: "reopen_race_no_row_updated" };

  const attachedBookingIds: string[] = [];
  if (params.attachOrphanBookingsInMonth !== false) {
    const monthStart = `${row.month}-01`;
    const monthEnd = lastDayYmdOfInvoiceMonth(row.month);
    const { data: orphans, error: orphanErr } = await admin
      .from("bookings")
      .select("id")
      .eq("customer_id", row.customer_id)
      .is("monthly_invoice_id", null)
      .eq("is_monthly_billing_booking", true)
      .eq("payment_status", "pending_monthly")
      .neq("status", "cancelled")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (orphanErr) return { ok: false, error: orphanErr.message };

    for (const orphan of orphans ?? []) {
      const bookingId = String((orphan as { id: string }).id);
      const { data: attached, error: attachErr } = await admin
        .from("bookings")
        .update({ monthly_invoice_id: row.id })
        .eq("id", bookingId)
        .is("monthly_invoice_id", null)
        .select("id");
      if (attachErr) return { ok: false, error: attachErr.message };
      if (attached?.length) attachedBookingIds.push(bookingId);
    }

    if (attachedBookingIds.length > 0) {
      const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", {
        p_invoice_id: row.id,
      });
      if (rpcErr) return { ok: false, error: rpcErr.message };
    }
  }

  await refreshDraftMonthlyInvoiceDueDate(admin, row.id);

  await appendMonthlyInvoiceSnapshotEvent(
    admin,
    row.id,
    {
      kind: "invoice_reopened_to_draft",
      at: nowIso,
      actor: params.actor ?? "system",
      reason: params.reason ?? "ops_reopen",
      attached_booking_ids: attachedBookingIds,
      zoho_voided: zohoVoided,
      previous_zoho_invoice_id: zohoId || null,
      paystack_reference: rotatedRef,
    },
    { source: params.source },
  );

  await logSystemEvent({
    level: "info",
    source: params.source,
    message: "monthly_invoice_reopened_to_draft",
    context: {
      invoice_id: row.id,
      customer_id: row.customer_id,
      month: row.month,
      attached_booking_ids: attachedBookingIds,
      zoho_voided: zohoVoided,
    },
  });

  return { ok: true, invoiceId: row.id, attachedBookingIds, zohoVoided };
}
