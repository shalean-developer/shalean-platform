import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type ApplyMonthlyInvoicePaymentResult =
  | { ok: true; skipped: true; reason: "not_found" | "already_paid" | "duplicate_charge" }
  | { ok: true; settled: "full"; invoiceId: string }
  | { ok: true; settled: "partial"; invoiceId: string; amount_paid_cents: number; total_amount_cents: number }
  | { ok: false; error: string };

/**
 * Applies Paystack `charge.success` to `monthly_invoices`: idempotent per charge `reference`,
 * accumulates `amount_paid_cents`, `partially_paid` until settled, then `paid` + booking settlement +
 * `payout_status = eligible` + `payout_frozen_cents` (immutable payout basis).
 */
export async function applyMonthlyInvoicePayment(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number },
): Promise<ApplyMonthlyInvoicePaymentResult> {
  const ref = params.reference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  const paidIn = Math.max(0, Math.round(params.amountCents));

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, balance_cents")
    .eq("paystack_reference", ref)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  if (!inv || typeof (inv as { id?: string }).id !== "string") {
    return { ok: true, skipped: true, reason: "not_found" };
  }

  const row = inv as {
    id: string;
    status: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
  };

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") {
    return { ok: true, skipped: true, reason: "already_paid" };
  }

  if (!["sent", "partially_paid", "overdue"].includes(st)) {
    return { ok: false, error: `invoice_not_payable_status:${st || "unknown"}` };
  }

  const { error: dedupErr } = await admin.from("monthly_invoice_paystack_charge_dedup").insert({
    charge_reference: ref,
    invoice_id: row.id,
    amount_cents: paidIn,
  });

  if (dedupErr) {
    const code = (dedupErr as { code?: string }).code;
    if (code === "23505") {
      return { ok: true, skipped: true, reason: "duplicate_charge" };
    }
    return { ok: false, error: dedupErr.message };
  }

  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const prevPaid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  const newPaid = prevPaid + paidIn;
  const capPaid = total > 0 ? Math.min(newPaid, total) : newPaid;
  const fullySettled = total <= 0 ? newPaid >= 0 : capPaid >= total;

  const nowIso = new Date().toISOString();
  const balanceCentsAfter = Math.max(0, total - capPaid);

  if (fullySettled) {
    await appendMonthlyInvoiceSnapshotEvent(
      admin,
      row.id,
      {
        kind: "payment_received",
        at: nowIso,
        paystack_charge_reference: ref,
        amount_cents: paidIn,
        amount_paid_cents_after: capPaid,
        total_amount_cents: total,
        balance_cents_after: balanceCentsAfter,
        settled: "full",
        actor: "system",
        reference: ref,
      },
      { source: "monthly_invoice/payment" },
    );

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

    if (upInv) {
      await admin.from("monthly_invoice_paystack_charge_dedup").delete().eq("charge_reference", ref);
      return { ok: false, error: upInv.message };
    }

    const { data: bookings, error: bErr } = await admin
      .from("bookings")
      .select("id, total_paid_zar, amount_paid_cents")
      .eq("monthly_invoice_id", row.id)
      .neq("status", "cancelled");

    if (bErr) {
      await admin.from("monthly_invoice_paystack_charge_dedup").delete().eq("charge_reference", ref);
      return { ok: false, error: bErr.message };
    }

    for (const raw of bookings ?? []) {
      const b = raw as { id: string; total_paid_zar: number | null; amount_paid_cents: number | null };
      const lineCents = Math.max(0, Math.round(Number(b.total_paid_zar ?? 0) * 100));
      const { error: u } = await admin
        .from("bookings")
        .update({
          payment_status: "success",
          amount_paid_cents: lineCents > 0 ? lineCents : b.amount_paid_cents ?? 0,
          payout_status: "eligible",
          payout_frozen_cents: lineCents > 0 ? lineCents : b.amount_paid_cents ?? 0,
        })
        .eq("id", b.id);
      if (u) {
        await logSystemEvent({
          level: "error",
          source: "monthly_invoice/payment",
          message: "monthly_invoice_booking_settlement_failed",
          context: { invoice_id: row.id, booking_id: b.id, reference: ref, error: u.message },
        });
        return { ok: false, error: u.message };
      }
    }

    await logSystemEvent({
      level: "info",
      source: "monthly_invoice/payment",
      message: "monthly_invoice_paid_full",
      context: { invoice_id: row.id, reference: ref, amount_paid_cents: capPaid, total_amount_cents: total },
    });

    return { ok: true, settled: "full", invoiceId: row.id };
  }

  const { error: upPartial } = await admin
    .from("monthly_invoices")
    .update({
      amount_paid_cents: capPaid,
      status: "partially_paid",
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .in("status", ["sent", "partially_paid", "overdue"]);

  if (upPartial) {
    await admin.from("monthly_invoice_paystack_charge_dedup").delete().eq("charge_reference", ref);
    return { ok: false, error: upPartial.message };
  }

  await appendMonthlyInvoiceSnapshotEvent(admin, row.id, {
    kind: "payment_received",
    at: nowIso,
    paystack_charge_reference: ref,
    amount_cents: paidIn,
    amount_paid_cents_after: capPaid,
    total_amount_cents: total,
    balance_cents_after: balanceCentsAfter,
    settled: "partial",
    actor: "system",
    reference: ref,
  }, { source: "monthly_invoice/payment" });

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/payment",
    message: "monthly_invoice_paid_partial",
    context: { invoice_id: row.id, reference: ref, amount_paid_cents: capPaid, total_amount_cents: total },
  });

  return {
    ok: true,
    settled: "partial",
    invoiceId: row.id,
    amount_paid_cents: capPaid,
    total_amount_cents: total,
  };
}
