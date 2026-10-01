import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshDraftMonthlyInvoiceDueDate } from "@/lib/monthlyInvoice/refreshDraftMonthlyInvoiceDueDate";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type RevertManualPaidMonthlyInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      restoredBookingIds: string[];
      zohoReconciliationRequired: boolean;
    }
  | { ok: false; error: string };

type SnapshotBooking = {
  id?: unknown;
  amount_paid_cents?: unknown;
};

function snapshotBookingPaidMap(snapshot: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return map;
  const bookings = (snapshot as { bookings?: unknown }).bookings;
  if (!Array.isArray(bookings)) return map;
  for (const raw of bookings as SnapshotBooking[]) {
    const id = String(raw?.id ?? "").trim();
    if (!id) continue;
    const amount = Math.max(0, Math.round(Number(raw?.amount_paid_cents ?? 0)));
    map.set(id, Number.isFinite(amount) ? amount : 0);
  }
  return map;
}

/**
 * Guarded recovery for an invoice that was settled only by admin manual mark-paid.
 *
 * This deliberately refuses to reverse any invoice with evidence of real Paystack
 * settlement or payout disbursement. Zoho linkage is preserved and the caller is
 * told when accounting reconciliation is still required.
 */
export async function revertManualPaidMonthlyInvoiceToDraft(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    adminEmail: string;
    adminUserId: string;
    reason: string;
  },
): Promise<RevertManualPaidMonthlyInvoiceResult> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, is_closed, total_amount_cents, amount_paid_cents, balance_cents, snapshot_at_finalize, zoho_invoice_id, zoho_invoice_number",
    )
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  if (!inv) return { ok: false, error: "invoice_not_found" };

  const row = inv as {
    id: string;
    customer_id: string;
    month: string;
    status: string | null;
    is_closed: boolean | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    snapshot_at_finalize: unknown;
    zoho_invoice_id: string | null;
    zoho_invoice_number: string | null;
  };

  if (String(row.status ?? "").toLowerCase() !== "paid" || !row.is_closed) {
    return { ok: false, error: "invoice_not_paid_closed" };
  }

  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const paid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  if (total <= 0 || paid !== total || Math.max(0, Math.round(Number(row.balance_cents ?? 0))) !== 0) {
    return { ok: false, error: "invoice_not_full_manual_settlement_shape" };
  }

  const [{ data: manualEvents, error: manualErr }, { count: paystackDedupCount, error: dedupErr }, { count: txCount, error: txErr }, { count: paymentEventCount, error: paymentEventErr }] =
    await Promise.all([
      admin
        .from("monthly_invoice_events")
        .select("id, payload, created_at")
        .eq("invoice_id", row.id)
        .eq("kind", "admin_mark_paid")
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("monthly_invoice_paystack_charge_dedup")
        .select("charge_reference", { count: "exact", head: true })
        .eq("invoice_id", row.id),
      admin
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "monthly_invoice")
        .eq("entity_id", row.id)
        .eq("gateway", "paystack"),
      admin
        .from("monthly_invoice_events")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", row.id)
        .eq("kind", "payment_received"),
    ]);

  if (manualErr) return { ok: false, error: manualErr.message };
  if (dedupErr) return { ok: false, error: dedupErr.message };
  if (txErr) return { ok: false, error: txErr.message };
  if (paymentEventErr) return { ok: false, error: paymentEventErr.message };

  const manual = manualEvents?.[0] as { id?: string; payload?: Record<string, unknown>; created_at?: string } | undefined;
  if (!manual?.id) return { ok: false, error: "manual_mark_paid_event_missing" };

  if ((paystackDedupCount ?? 0) > 0 || (txCount ?? 0) > 0 || (paymentEventCount ?? 0) > 0) {
    return { ok: false, error: "real_paystack_payment_exists" };
  }

  const payload = manual.payload ?? {};
  const paidAfter = Math.max(0, Math.round(Number(payload.amount_paid_cents_after ?? paid)));
  const recorded = Math.max(0, Math.round(Number(payload.amount_recorded_cents ?? payload.amount_cents ?? 0)));
  const previousPaid = Math.max(0, paidAfter - recorded);
  if (paidAfter !== total || recorded !== total || previousPaid !== 0) {
    return { ok: false, error: "manual_mark_paid_not_reversible_to_clean_draft" };
  }

  const { data: bookings, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, amount_paid_cents, payout_status, payout_frozen_cents, payout_id, payout_run_id, payout_paid_at, payment_completed_at",
    )
    .eq("monthly_invoice_id", row.id)
    .neq("status", "cancelled");

  if (bookingErr) return { ok: false, error: bookingErr.message };

  const children = (bookings ?? []) as Array<{
    id: string;
    status: string | null;
    payment_status: string | null;
    amount_paid_cents: number | null;
    payout_status: string | null;
    payout_frozen_cents: number | null;
    payout_id: string | null;
    payout_run_id: string | null;
    payout_paid_at: string | null;
    payment_completed_at: string | null;
  }>;

  for (const child of children) {
    if (
      String(child.payout_status ?? "").toLowerCase() === "paid" ||
      child.payout_id ||
      child.payout_run_id ||
      child.payout_paid_at
    ) {
      return { ok: false, error: `booking_payout_already_disbursed:${child.id}` };
    }
  }

  const previousPaidByBooking = snapshotBookingPaidMap(row.snapshot_at_finalize);
  const restoredBookingIds: string[] = [];

  // Restore children first. If a child update fails, abort before reopening the invoice.
  for (const child of children) {
    const previousChildPaid = previousPaidByBooking.get(child.id) ?? 0;
    const { data: restored, error: restoreErr } = await admin
      .from("bookings")
      .update({
        payment_status: "pending_monthly",
        amount_paid_cents: previousChildPaid,
        payout_status: "pending",
        payout_frozen_cents: null,
        payment_completed_at: null,
      })
      .eq("id", child.id)
      .eq("monthly_invoice_id", row.id)
      .neq("payout_status", "paid")
      .is("payout_id", null)
      .is("payout_run_id", null)
      .is("payout_paid_at", null)
      .select("id");

    if (restoreErr) return { ok: false, error: restoreErr.message };
    if (!restored?.length) return { ok: false, error: `booking_revert_guard_failed:${child.id}` };
    restoredBookingIds.push(child.id);
  }

  const nowIso = new Date().toISOString();
  const { data: reopened, error: reopenErr } = await admin
    .from("monthly_invoices")
    .update({
      status: "draft",
      amount_paid_cents: 0,
      is_closed: false,
      is_overdue: false,
      closure_reason: null,
      sent_at: null,
      finalized_at: null,
      payment_link: null,
      paystack_reference: null,
      snapshot_at_finalize: null,
      snapshot_current: null,
      snapshot_version: 0,
      initial_invoice_email_dispatch_claimed: false,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "paid")
    .eq("is_closed", true)
    .eq("amount_paid_cents", total)
    .select("id");

  if (reopenErr) return { ok: false, error: reopenErr.message };
  if (!reopened?.length) return { ok: false, error: "invoice_revert_guard_failed" };

  await refreshDraftMonthlyInvoiceDueDate(admin, row.id);

  const reason = params.reason.trim().slice(0, 2000) || "Manual mark-paid reversed by admin";
  const zohoReconciliationRequired = Boolean(String(row.zoho_invoice_id ?? "").trim());

  const { error: auditErr } = await admin.from("monthly_invoice_events").insert({
    invoice_id: row.id,
    kind: "admin_revert_to_draft",
    payload: {
      kind: "admin_revert_to_draft",
      at: nowIso,
      actor: `admin:${params.adminEmail}`,
      admin_email: params.adminEmail,
      admin_user_id: params.adminUserId,
      reason,
      reversed_event_id: manual.id,
      amount_paid_cents_after: 0,
      balance_cents_after: total,
      booking_count_restored: restoredBookingIds.length,
      zoho_invoice_id: row.zoho_invoice_id,
      zoho_invoice_number: row.zoho_invoice_number,
      zoho_reconciliation_required: zohoReconciliationRequired,
    },
  });

  if (auditErr) {
    await logSystemEvent({
      level: "warn",
      source: "monthly_invoice/admin_revert",
      message: "monthly_invoice_revert_audit_event_failed",
      context: { invoice_id: row.id, error: auditErr.message },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/admin_revert",
    message: "monthly_invoice_manual_paid_reverted_to_draft",
    context: {
      invoice_id: row.id,
      admin_email: params.adminEmail,
      restored_booking_ids: restoredBookingIds,
      zoho_reconciliation_required: zohoReconciliationRequired,
    },
  });

  return {
    ok: true,
    invoiceId: row.id,
    restoredBookingIds,
    zohoReconciliationRequired,
  };
}
