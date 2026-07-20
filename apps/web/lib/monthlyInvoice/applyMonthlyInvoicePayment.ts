import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { clearMonthlyInvoicePaymentLink } from "@/lib/monthlyInvoice/clearMonthlyInvoicePaymentLink";
import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import {
  MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE,
  monthlyInvoiceChargeMatchesRemainingBalance,
  normalizeCents,
} from "@/lib/monthlyInvoice/monthlyInvoiceAmountIntegrity";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { monthlyInvoicePaystackReferencesMatch } from "@/lib/monthlyInvoice/monthlyInvoicePaystackReference";
import { resolveMonthlyInvoiceForPaystackCharge } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceForPaystackCharge";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import { resolveZohoCustomerContactForMonthlyInvoice } from "@/lib/zoho/resolveZohoCustomerContact";

export type ApplyMonthlyInvoicePaymentResult =
  | {
      ok: true;
      skipped: true;
      reason: "not_found" | "already_paid" | "duplicate_charge" | typeof MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE;
    }
  | { ok: true; settled: "full"; invoiceId: string }
  | { ok: true; settled: "partial"; invoiceId: string; amount_paid_cents: number; total_amount_cents: number }
  | { ok: false; error: string };

/**
 * Applies Paystack `charge.success` to `monthly_invoices`: idempotent per charge `reference`,
 * accumulates `amount_paid_cents`, `partially_paid` until settled, then `paid` + booking settlement +
 * `payout_status = eligible` + `payout_frozen_cents` (immutable cleaner earnings basis from display / cleaner_payout).
 * After each settled booking row, {@link refreshRecurringBookingPaymentState} runs so `payment_state` matches the per-booking recurring projection (invoice settlement vs operational truth).
 *
 * Side-effect order for one `charge.success`: insert dedup row → invoice + booking rows (sequential updates) → `payment_state` refresh per booking.
 * A single large DB transaction is intentionally not used here (Phase 10C): map replay via dedup, partial-loop failure modes, and compensating repair before wrapping.
 */
export async function applyMonthlyInvoicePayment(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number; invoiceIdHint?: string | null },
): Promise<ApplyMonthlyInvoicePaymentResult> {
  const ref = params.reference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  const paidIn = Math.max(0, Math.round(params.amountCents));

  let row: {
    id: string;
    status: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    paystack_reference: string | null;
  };

  try {
    const resolved = await resolveMonthlyInvoiceForPaystackCharge(admin, {
      reference: ref,
      invoiceIdHint: params.invoiceIdHint,
    });
    if (!resolved) {
      return { ok: true, skipped: true, reason: "not_found" };
    }
    row = resolved;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "lookup_failed" };
  }

  if (!monthlyInvoicePaystackReferencesMatch(row.id, row.paystack_reference, ref)) {
    const { error: refPatchErr } = await admin
      .from("monthly_invoices")
      .update({ paystack_reference: ref })
      .eq("id", row.id);
    if (refPatchErr) return { ok: false, error: refPatchErr.message };
  }

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") {
    const { data: existingBookings, error: existingBookingsErr } = await admin
      .from("bookings")
      .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
      .eq("monthly_invoice_id", row.id)
      .neq("status", "cancelled");

    if (existingBookingsErr) return { ok: false, error: existingBookingsErr.message };

    const childSettlement = await settleMonthlyInvoiceChildren(admin, {
      invoiceId: row.id,
      children: (existingBookings ?? []) as {
        id: string;
        total_paid_zar: number | null;
        amount_paid_cents: number | null;
        display_earnings_cents: number | null;
        cleaner_payout_cents: number | null;
      }[],
      source: "monthly_invoice/payment",
      reference: ref,
    });
    if (!childSettlement.ok) {
      return { ok: false, error: childSettlement.error };
    }
    return { ok: true, skipped: true, reason: "already_paid" };
  }

  if (!["sent", "partially_paid", "overdue"].includes(st)) {
    return { ok: false, error: `invoice_not_payable_status:${st || "unknown"}` };
  }

  const remainingBalance = normalizeCents(row.balance_cents);
  // BILL-INV-002 Phase A (C01): refuse to settle when Paystack amount ≠ current remaining balance.
  // Stale checkout sessions after adjustments are quarantined (link cleared; no ledger apply).
  if (!monthlyInvoiceChargeMatchesRemainingBalance(paidIn, remainingBalance)) {
    await clearMonthlyInvoicePaymentLink(admin, row.id);
    const nowIsoQuarantine = new Date().toISOString();
    await appendMonthlyInvoiceSnapshotEvent(
      admin,
      row.id,
      {
        kind: "payment_amount_quarantined",
        at: nowIsoQuarantine,
        paystack_charge_reference: ref,
        amount_cents: paidIn,
        balance_cents_after: remainingBalance,
        expected_balance_cents: remainingBalance,
        actor: "system",
        reference: ref,
      },
      { source: "monthly_invoice/payment" },
    );
    await reportOperationalIssue(
      "error",
      "monthly_invoice/payment",
      MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE,
      {
        invoice_id: row.id,
        charged_cents: paidIn,
        remaining_balance_cents: remainingBalance,
      },
    );
    await logSystemEvent({
      level: "error",
      source: "monthly_invoice/payment",
      message: MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE,
      context: {
        invoice_id: row.id,
        charged_cents: paidIn,
        remaining_balance_cents: remainingBalance,
      },
    });
    return { ok: true, skipped: true, reason: MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE };
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
  // With amount===remaining balance, settlement is always full for the open remainder.
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
      .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
      .eq("monthly_invoice_id", row.id)
      .neq("status", "cancelled");

    if (bErr) {
      await admin.from("monthly_invoice_paystack_charge_dedup").delete().eq("charge_reference", ref);
      return { ok: false, error: bErr.message };
    }

    const childSettlement = await settleMonthlyInvoiceChildren(admin, {
      invoiceId: row.id,
      children: (bookings ?? []) as {
        id: string;
        total_paid_zar: number | null;
        amount_paid_cents: number | null;
        display_earnings_cents: number | null;
        cleaner_payout_cents: number | null;
      }[],
      source: "monthly_invoice/payment",
      reference: ref,
    });
    if (!childSettlement.ok) {
      return { ok: false, error: childSettlement.error };
    }

    await logSystemEvent({
      level: "info",
      source: "monthly_invoice/payment",
      message: "monthly_invoice_paid_full",
      context: { invoice_id: row.id, reference: ref, amount_paid_cents: capPaid, total_amount_cents: total },
    });

    // Sync payment to Zoho Books (non-blocking — failures are logged but don't fail settlement)
    if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
      const { data: invRow } = await admin
        .from("monthly_invoices")
        .select("zoho_invoice_id, customer_id")
        .eq("id", row.id)
        .maybeSingle();

      const zohoInvoiceId = (invRow as { zoho_invoice_id?: string | null } | null)?.zoho_invoice_id;
      const customerId = (invRow as { customer_id?: string } | null)?.customer_id ?? "";
      if (zohoInvoiceId && customerId) {
        const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
          invoiceId: row.id,
          customerId,
        });
        if (contactRes.ok) {
          await markZohoInvoicePaid({
            zohoInvoiceId,
            amountZar: capPaid / 100,
            paymentDate: todayYmdJhb(),
            reference: ref,
            customerEmail: contactRes.contact.email,
            customerName: contactRes.contact.name,
          });
        }
      }
    }

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
