import "server-only";

import { buildMonthlyInvoiceSnapshot, wrapSnapshotCurrentV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { isInvoiceMonthReadyToFinalize, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { initializePaystackForMonthlyInvoice } from "@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice";
import { sendMonthlyInvoiceEmail } from "@/lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerFrozenCentsForSettlement } from "@/lib/cleaner/resolveCleanerEarnings";

export type FinalizeMonthlyInvoicesResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  today?: string;
  finalized?: number;
  errors?: string[];
};

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDueDate(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00Z`);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

/**
 * Idempotent finalize: any draft invoice whose calendar month has ended (today ≥ last day of that month,
 * Africa/Johannesburg) is recomputed, then Paystack + email (or zero-close with closure_reason).
 * Missed last-day cron runs still pick up the same drafts on later days.
 */
export async function finalizeDueMonthlyInvoices(): Promise<FinalizeMonthlyInvoicesResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "supabase_admin_missing" };

  const today = todayJohannesburg();
  const todayYm = today.slice(0, 7);
  const errors: string[] = [];
  let finalized = 0;

  const { data: draftRows, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status")
    .eq("status", "draft")
    .lte("month", todayYm);

  if (error) {
    await reportOperationalIssue("error", "cron/finalize-monthly-invoices", error.message);
    return { ok: false, reason: error.message, today };
  }

  const drafts = (draftRows ?? []).filter((r) =>
    isInvoiceMonthReadyToFinalize(today, String((r as { month?: string }).month ?? "")),
  );

  for (const raw of drafts) {
    const inv = raw as { id: string; customer_id: string; month: string; due_date: string; status: string };
    const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: inv.id });
    if (rpcErr) {
      errors.push(`${inv.id}: ${rpcErr.message}`);
      continue;
    }

    const { data: fresh, error: loadErr } = await admin
      .from("monthly_invoices")
      .select("id, total_amount_cents, due_date, month")
      .eq("id", inv.id)
      .maybeSingle();

    if (loadErr || !fresh) {
      errors.push(`${inv.id}: reload_failed`);
      continue;
    }

    const f = fresh as { id: string; total_amount_cents: number | null; due_date: string; month: string };
    const cents = Math.max(0, Math.round(Number(f.total_amount_cents ?? 0)));

    if (cents === 0) {
      const nowIso = new Date().toISOString();
      const snapshot = await buildMonthlyInvoiceSnapshot(admin, f.id);
      if (!snapshot) {
        errors.push(`${f.id}: snapshot_build_failed`);
        continue;
      }
      const snapshotCurrent = wrapSnapshotCurrentV1(snapshot);
      const bookingCount = Math.round(Number(snapshot.totals.total_bookings ?? 0));
      const { error: snapDraftErr } = await admin
        .from("monthly_invoices")
        .update({
          snapshot_at_finalize: snapshot,
          snapshot_current: snapshotCurrent,
          snapshot_version: 1,
          finalized_at: nowIso,
        })
        .eq("id", f.id)
        .eq("status", "draft");
      if (snapDraftErr) {
        errors.push(`${f.id}: zero_snapshot:${snapDraftErr.message}`);
        continue;
      }
      const finEv = await appendMonthlyInvoiceSnapshotEvent(
        admin,
        f.id,
        {
          kind: "invoice_finalized",
          at: nowIso,
          total_amount_cents: cents,
          booking_count: bookingCount,
        },
        { source: "cron/finalize-monthly-invoices" },
      );
      if (!finEv.ok) {
        errors.push(`${f.id}: finalize_event:${finEv.error}`);
      }
      const { error: zeroPaidErr } = await admin
        .from("monthly_invoices")
        .update({
          status: "paid",
          closure_reason: "zero_amount",
        })
        .eq("id", f.id)
        .eq("status", "draft");
      if (zeroPaidErr) {
        errors.push(`${f.id}: zero_close:${zeroPaidErr.message}`);
        continue;
      }
      const { data: lines } = await admin
        .from("bookings")
        .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
        .eq("monthly_invoice_id", f.id)
        .neq("status", "cancelled");
      for (const raw of lines ?? []) {
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
          errors.push(`${f.id}: booking_missing_cleaner_earnings_basis:${b.id}`);
          continue;
        }
        await admin
          .from("bookings")
          .update({
            payment_status: "success",
            amount_paid_cents: lineCents > 0 ? lineCents : b.amount_paid_cents ?? 0,
            payout_status: "eligible",
            payout_frozen_cents: frozen,
          })
          .eq("id", b.id);
      }
      finalized++;
      continue;
    }

    const userRes = await admin.auth.admin.getUserById(inv.customer_id);
    const email = String(userRes.data.user?.email ?? "").trim().toLowerCase();
    if (!email) {
      errors.push(`${inv.id}: customer_email_missing`);
      continue;
    }

    const snapshot = await buildMonthlyInvoiceSnapshot(admin, f.id);
    if (!snapshot) {
      errors.push(`${f.id}: snapshot_build_failed`);
      continue;
    }
    const snapshotCurrent = wrapSnapshotCurrentV1(snapshot);
    const { error: snapErr } = await admin
      .from("monthly_invoices")
      .update({
        snapshot_at_finalize: snapshot,
        snapshot_current: snapshotCurrent,
        snapshot_version: 1,
      })
      .eq("id", f.id)
      .eq("status", "draft");
    if (snapErr) {
      errors.push(`${f.id}: snapshot_failed:${snapErr.message}`);
      continue;
    }

    const finEv = await appendMonthlyInvoiceSnapshotEvent(
      admin,
      f.id,
      {
        kind: "invoice_finalized",
        at: new Date().toISOString(),
        total_amount_cents: cents,
        booking_count: Math.round(Number(snapshot.totals.total_bookings ?? 0)),
      },
      { source: "cron/finalize-monthly-invoices" },
    );
    if (!finEv.ok) {
      errors.push(`${f.id}: finalize_event:${finEv.error}`);
    }

    const pay = await initializePaystackForMonthlyInvoice(admin, { invoiceId: f.id, customerEmail: email });
    if (!pay.ok) {
      errors.push(`${inv.id}: ${pay.error}`);
      continue;
    }

    const balanceZar = Math.max(0, cents) / 100;
    await sendMonthlyInvoiceEmail({
      to: email,
      monthLabel: formatMonthLabel(f.month),
      totalZar: balanceZar,
      paymentUrl: pay.authorizationUrl,
      dueDateLabel: formatDueDate(f.due_date),
    });

    finalized++;
  }

  await logSystemEvent({
    level: "info",
    source: "cron/finalize-monthly-invoices",
    message: "finalize_monthly_invoices_done",
    context: { today, todayYm, draft_candidates: drafts.length, finalized, error_count: errors.length },
  });

  return { ok: true, today, finalized, errors: errors.length ? errors : undefined };
}
