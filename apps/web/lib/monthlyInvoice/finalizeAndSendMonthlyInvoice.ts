import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { createNotificationConfigBreaker } from "@/lib/email/notificationConfigBreaker";
import { formatDueDateLabel, formatMonthLongYearUtc } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { buildMonthlyInvoiceSnapshot, wrapSnapshotCurrentV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import { assessMonthlyInvoiceFinalizeReadiness } from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import {
  appendMonthlyInvoiceSnapshotEvent,
  invoicePaymentLinkEmailSentExists,
} from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { initializePaystackForMonthlyInvoice } from "@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice";
import { sendMonthlyInvoiceEmail } from "@/lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";
import { syncMonthlyInvoiceToZohoBooks } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { markZohoInvoiceSent } from "@/lib/zoho/zohoBooksService";
import { resolveMonthlyInvoiceCustomerEmail } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { trustMonthlyInvoicePayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { readCustomerProfileContact } from "@/lib/customer/readCustomerProfileContact";

type EmailBreaker = ReturnType<typeof createNotificationConfigBreaker>;

export type FinalizeAndSendMonthlyInvoiceResult =
  | { ok: true; outcome: "sent"; paymentUrl: string; sentAt: string | null; alreadyEmailed: boolean }
  | { ok: true; outcome: "paid_zero" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

/**
 * Finalize a draft monthly invoice: snapshot, Paystack link, draft → sent, customer email.
 * Cron uses schedule readiness; admin may pass `forceEarlySend` before the last visit.
 */
export async function finalizeAndSendMonthlyInvoice(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    customerId: string;
    month: string;
    todayYmd: string;
    forceEarlySend?: boolean;
    actor?: string;
    source: string;
    emailBreaker?: EmailBreaker;
  },
): Promise<FinalizeAndSendMonthlyInvoiceResult> {
  const { data: head, error: headErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, is_closed")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (headErr) return { ok: false, error: headErr.message };
  const headRow = head as {
    id: string;
    customer_id: string;
    month: string;
    due_date: string | null;
    status: string | null;
    is_closed: boolean | null;
  } | null;

  if (!headRow) return { ok: false, error: "not_found" };
  if (Boolean(headRow.is_closed)) return { ok: false, error: "invoice_closed" };
  if (String(headRow.status ?? "").toLowerCase() !== "draft") {
    return { ok: false, error: "invoice_not_draft" };
  }

  let paymentDueDate = String(headRow.due_date ?? params.todayYmd).slice(0, 10);

  if (!params.forceEarlySend) {
    const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
      invoiceId: params.invoiceId,
      customerId: params.customerId,
      month: params.month,
      todayYmd: params.todayYmd,
    });
    if (!readiness.ready) {
      return { ok: false, skipped: true, reason: readiness.reason ?? "not_ready" };
    }
    paymentDueDate = readiness.paymentDueDateYmd ?? params.todayYmd;
  }

  const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: params.invoiceId });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  const { data: postRpc } = await admin.from("monthly_invoices").select("status").eq("id", params.invoiceId).maybeSingle();
  if (String(postRpc?.status ?? "").toLowerCase() !== "draft") {
    return { ok: false, error: "invoice_no_longer_draft" };
  }

  const { data: fresh, error: loadErr } = await admin
    .from("monthly_invoices")
    .select("id, total_amount_cents, due_date, month")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (loadErr || !fresh) return { ok: false, error: "reload_failed" };

  const row = fresh as { id: string; total_amount_cents: number | null; due_date: string | null; month: string };
  const cents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));

  if (params.forceEarlySend) {
    paymentDueDate = String(row.due_date ?? paymentDueDate).slice(0, 10);
  } else {
    await admin
      .from("monthly_invoices")
      .update({ due_date: paymentDueDate })
      .eq("id", row.id)
      .eq("status", "draft");
  }

  if (cents === 0) {
    const nowIso = new Date().toISOString();
    const snapshot = await buildMonthlyInvoiceSnapshot(admin, row.id);
    if (!snapshot) return { ok: false, error: "snapshot_build_failed" };

    const { error: snapDraftErr } = await admin
      .from("monthly_invoices")
      .update({
        snapshot_at_finalize: snapshot,
        snapshot_current: wrapSnapshotCurrentV1(snapshot),
        snapshot_version: 1,
        finalized_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", "draft");
    if (snapDraftErr) return { ok: false, error: snapDraftErr.message };

    await appendMonthlyInvoiceSnapshotEvent(
      admin,
      row.id,
      {
        kind: "invoice_finalized",
        at: nowIso,
        total_amount_cents: cents,
        booking_count: Math.round(Number(snapshot.totals.total_bookings ?? 0)),
      },
      { source: params.source },
    );

    const { error: zeroPaidErr } = await admin
      .from("monthly_invoices")
      .update({ status: "paid", closure_reason: "zero_amount" })
      .eq("id", row.id)
      .eq("status", "draft");
    if (zeroPaidErr) return { ok: false, error: zeroPaidErr.message };

    const { data: lines } = await admin
      .from("bookings")
      .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
      .eq("monthly_invoice_id", row.id)
      .neq("status", "cancelled");

    const childSettlement = await settleMonthlyInvoiceChildren(admin, {
      invoiceId: row.id,
      children: (lines ?? []) as {
        id: string;
        total_paid_zar: number | null;
        amount_paid_cents: number | null;
        display_earnings_cents: number | null;
        cleaner_payout_cents: number | null;
      }[],
      source: params.source,
      reference: "zero_amount",
    });
    if (!childSettlement.ok) return { ok: false, error: childSettlement.error };

    return { ok: true, outcome: "paid_zero" };
  }

  const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
    customerId: params.customerId,
    invoiceId: row.id,
  });
  if (!email) {
    await reportOperationalIssue("warn", "monthly_invoice/email", "customer_email_missing", {
      invoiceId: row.id,
      customerId: params.customerId,
    });
    return { ok: false, error: "customer_email_missing" };
  }

  const snapshot = await buildMonthlyInvoiceSnapshot(admin, row.id);
  if (!snapshot) return { ok: false, error: "snapshot_build_failed" };

  const { data: snapRows, error: snapErr } = await admin
    .from("monthly_invoices")
    .update({
      snapshot_at_finalize: snapshot,
      snapshot_current: wrapSnapshotCurrentV1(snapshot),
      snapshot_version: 1,
    })
    .eq("id", row.id)
    .eq("status", "draft")
    .select("id");

  if (snapErr) return { ok: false, error: snapErr.message };
  if (!snapRows?.length) return { ok: false, error: "snapshot_not_applied" };

  await appendMonthlyInvoiceSnapshotEvent(
    admin,
    row.id,
    {
      kind: "invoice_finalized",
      at: new Date().toISOString(),
      total_amount_cents: cents,
      booking_count: Math.round(Number(snapshot.totals.total_bookings ?? 0)),
    },
    { source: params.source },
  );

  const pay = await initializePaystackForMonthlyInvoice(admin, { invoiceId: row.id, customerEmail: email });
  if (!pay.ok) return { ok: false, error: pay.error };

  const brandedPayUrl = trustMonthlyInvoicePayPageUrl(row.id, pay.reference, pay.authorizationUrl);
  const balanceZar = cents / 100;

  const zohoSync = await syncMonthlyInvoiceToZohoBooks(admin, {
    invoiceId: row.id,
    customerId: params.customerId,
    month: row.month,
    dueDate: paymentDueDate,
    balanceZar,
    paymentUrl: brandedPayUrl,
    status: "draft",
  });
  if (!zohoSync.ok && zohoSync.error !== "zero_balance") {
    await reportOperationalIssue("warn", "monthly_invoice/zoho_sync", zohoSync.error, {
      invoiceId: row.id,
      customerId: params.customerId,
    });
    await logSystemEvent({
      level: "warn",
      source: "monthly_invoice/finalize",
      message: "zoho_sync_failed_email_continues",
      context: { invoice_id: row.id, error: zohoSync.error },
    });
  }

  if (await invoicePaymentLinkEmailSentExists(admin, row.id)) {
    return { ok: true, outcome: "sent", paymentUrl: brandedPayUrl, sentAt: null, alreadyEmailed: true };
  }

  if (params.emailBreaker?.shouldSkipRemainingSends()) {
    return {
      ok: false,
      error: `invoice_email_skipped:${params.emailBreaker.skipReason()}`,
    };
  }

  const { data: claimRows, error: claimErr } = await admin
    .from("monthly_invoices")
    .update({ initial_invoice_email_dispatch_claimed: true })
    .eq("id", row.id)
    .eq("initial_invoice_email_dispatch_claimed", false)
    .select("id");

  if (claimErr) return { ok: false, error: claimErr.message };

  if (!claimRows?.length) {
    if (await invoicePaymentLinkEmailSentExists(admin, row.id)) {
      return { ok: true, outcome: "sent", paymentUrl: brandedPayUrl, sentAt: null, alreadyEmailed: true };
    }
    return { ok: false, error: "email_dispatch_claim_failed" };
  }

  let zohoInvoiceId = zohoSync.ok ? zohoSync.zohoInvoiceId : "";
  if (!zohoInvoiceId) {
    const { data: zohoRow } = await admin
      .from("monthly_invoices")
      .select("zoho_invoice_id")
      .eq("id", row.id)
      .maybeSingle();
    zohoInvoiceId = String((zohoRow as { zoho_invoice_id?: string | null } | null)?.zoho_invoice_id ?? "").trim();
  }

  const mail = await sendMonthlyInvoiceEmail({
    to: email,
    customerName: (await readCustomerProfileContact(admin, params.customerId)).fullName,
    monthLabel: formatMonthLongYearUtc(row.month),
    month: row.month,
    totalZar: balanceZar,
    paymentUrl: brandedPayUrl,
    paystackPaymentUrl: pay.authorizationUrl,
    dueDateLabel: formatDueDateLabel(paymentDueDate),
    zohoInvoiceId: zohoInvoiceId || null,
  });

  if (!mail.sent) {
    await params.emailBreaker?.recordSendOutcome({
      classification: mail.classification,
      errorMessage: mail.error,
      invoiceId: row.id,
    });
    await admin
      .from("monthly_invoices")
      .update({ initial_invoice_email_dispatch_claimed: false })
      .eq("id", row.id);
    return { ok: false, error: mail.error ?? "email_send_failed" };
  }

  const sentAt = new Date().toISOString();
  const evAppend = await appendMonthlyInvoiceSnapshotEvent(
    admin,
    row.id,
    {
      kind: "invoice_payment_link_email_sent",
      at: sentAt,
      actor: params.actor ?? "system",
      paystack_reference: pay.reference,
    },
    { source: params.source },
  );

  if (!evAppend.ok) {
    await admin
      .from("monthly_invoices")
      .update({ initial_invoice_email_dispatch_claimed: false })
      .eq("id", row.id);
    return { ok: false, error: evAppend.error ?? "email_event_failed" };
  }

  if (zohoInvoiceId) {
    // Non-fatal: keep Zoho in step with the now-sent monthly invoice.
    await markZohoInvoiceSent(zohoInvoiceId);
  }

  return { ok: true, outcome: "sent", paymentUrl: brandedPayUrl, sentAt, alreadyEmailed: false };
}
