import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { resolveCleanerFrozenCentsForSettlement } from "@/lib/cleaner/resolveCleanerEarnings";

/**
 * Records full settlement without Paystack (offline / ops). Allowed for sent / partially_paid / overdue only.
 */
export async function markMonthlyInvoicePaidManual(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    adminEmail: string;
    adminUserId: string;
    note?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, is_closed")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "invoice_not_found" };

  const row = inv as {
    id: string;
    status: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    is_closed: boolean | null;
  };

  if (row.is_closed) return { ok: false, error: "invoice_already_closed" };

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") return { ok: false, error: "already_paid" };
  if (!["sent", "partially_paid", "overdue"].includes(st)) {
    return { ok: false, error: "invalid_status_for_manual_pay" };
  }

  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const prevPaid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  const remaining = Math.max(0, total - prevPaid);
  const nowIso = new Date().toISOString();

  const { count: bookingCnt, error: cntErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("monthly_invoice_id", row.id)
    .neq("status", "cancelled");

  const bookingCountSettled =
    !cntErr && bookingCnt != null && Number.isFinite(bookingCnt) ? bookingCnt : undefined;

  const noteTrim = params.note?.trim() ? params.note.trim().slice(0, 2000) : undefined;

  const appendRes = await appendMonthlyInvoiceSnapshotEvent(
    admin,
    row.id,
    {
      kind: "admin_mark_paid",
      at: nowIso,
      admin_email: params.adminEmail,
      admin_user_id: params.adminUserId,
      amount_cents: remaining,
      amount_recorded_cents: remaining,
      amount_paid_cents_after: total,
      total_amount_cents: total,
      booking_count_settled: bookingCountSettled,
      balance_cents_after: 0,
      actor: `admin:${params.adminEmail}`,
      reference: "manual",
      ...(noteTrim ? { note: noteTrim } : {}),
      settled: "full",
    },
    { source: "monthly_invoice/admin_manual" },
  );
  if (!appendRes.ok) return { ok: false, error: appendRes.error };

  const capPaid = total;

  const { error: upInv } = await admin
    .from("monthly_invoices")
    .update({
      amount_paid_cents: capPaid,
      status: "paid",
      is_overdue: false,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .in("status", ["sent", "partially_paid", "overdue"]);

  if (upInv) return { ok: false, error: upInv.message };

  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
    .eq("monthly_invoice_id", row.id)
    .neq("status", "cancelled");

  if (bErr) return { ok: false, error: bErr.message };

  for (const raw of bookings ?? []) {
    const b = raw as {
      id: string;
      total_paid_zar: number | null;
      amount_paid_cents: number | null;
      display_earnings_cents: number | null;
      cleaner_payout_cents: number | null;
    };
    const lineCents = Math.max(0, Math.round(Number(b.total_paid_zar ?? 0) * 100));
    const frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: b.display_earnings_cents,
      cleaner_payout_cents: b.cleaner_payout_cents,
    });
    if (frozen == null) {
      return { ok: false, error: `booking_missing_cleaner_earnings_basis:${b.id}` };
    }
    const { error: u } = await admin
      .from("bookings")
      .update({
        payment_status: "success",
        amount_paid_cents: lineCents > 0 ? lineCents : b.amount_paid_cents ?? 0,
        payout_status: "eligible",
        payout_frozen_cents: frozen,
      })
      .eq("id", b.id);
    if (u) {
      await logSystemEvent({
        level: "error",
        source: "monthly_invoice/admin_manual",
        message: "monthly_invoice_manual_settle_booking_failed",
        context: { invoice_id: row.id, booking_id: b.id, error: u.message },
      });
      return { ok: false, error: u.message };
    }
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/admin_manual",
    message: "monthly_invoice_marked_paid_manual",
    context: {
      invoice_id: row.id,
      admin_email: params.adminEmail,
      amount_recorded_cents: remaining,
      note: noteTrim,
    },
  });

  return { ok: true };
}
