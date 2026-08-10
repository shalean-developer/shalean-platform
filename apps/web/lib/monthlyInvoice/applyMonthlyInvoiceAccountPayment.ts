import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyMonthlyInvoicePayment, type ApplyMonthlyInvoicePaymentResult } from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";
import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { loadMonthlyInvoiceCollection } from "@/lib/monthlyInvoice/monthlyInvoiceAccountCollection";
import { resolveMonthlyInvoiceForPaystackCharge } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceForPaystackCharge";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";
import { markZohoInvoiceCollectionPaid } from "@/lib/zoho/markZohoInvoiceCollectionPaid";
import { todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Adds statement-level collection on top of the existing single-invoice payment path.
 * Normal invoice payments are delegated unchanged to applyMonthlyInvoicePayment.
 */
export async function applyMonthlyInvoiceAccountPayment(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number; invoiceIdHint?: string | null },
): Promise<ApplyMonthlyInvoicePaymentResult> {
  const ref = params.reference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  let resolved: Awaited<ReturnType<typeof resolveMonthlyInvoiceForPaystackCharge>>;
  try {
    resolved = await resolveMonthlyInvoiceForPaystackCharge(admin, {
      reference: ref,
      invoiceIdHint: params.invoiceIdHint,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "lookup_failed" };
  }

  if (!resolved) return { ok: true, skipped: true, reason: "not_found" };

  const collectionRes = await loadMonthlyInvoiceCollection(admin, resolved.id);
  if (!collectionRes.ok) {
    // Preserve the existing behaviour for edge statuses / zero balances.
    return applyMonthlyInvoicePayment(admin, params);
  }

  const collection = collectionRes.collection;
  const paidIn = Math.max(0, Math.round(params.amountCents));

  // No arranged carry-forward: use the mature single-invoice path unchanged.
  if (collection.previous_balance_cents <= 0) {
    return applyMonthlyInvoicePayment(admin, params);
  }

  // If the checkout amount is still only the anchor balance, do not silently consume
  // a previous invoice. This protects old payment links created before the upgrade.
  if (paidIn === collection.current_balance_cents) {
    return applyMonthlyInvoicePayment(admin, params);
  }

  // Statement-level checkout is exact: customer must pay the total shown on the statement.
  if (paidIn !== collection.collection_total_cents) {
    await reportOperationalIssue(
      "error",
      "monthly_invoice/account_payment",
      "monthly_invoice_statement_amount_mismatch",
      {
        anchor_invoice_id: collection.anchor.id,
        charged_cents: paidIn,
        expected_statement_cents: collection.collection_total_cents,
      },
    );
    return { ok: true, skipped: true, reason: "amount_mismatch_quarantined" };
  }

  const { error: dedupErr } = await admin.from("monthly_invoice_paystack_charge_dedup").insert({
    charge_reference: ref,
    invoice_id: collection.anchor.id,
    amount_cents: paidIn,
  });
  if (dedupErr) {
    if ((dedupErr as { code?: string }).code === "23505") {
      return { ok: true, skipped: true, reason: "duplicate_charge" };
    }
    return { ok: false, error: dedupErr.message };
  }

  const nowIso = new Date().toISOString();
  const zohoAllocations: Array<{ zohoInvoiceId: string; amountZar: number }> = [];

  try {
    // Collection order is oldest arranged invoice(s), then the current anchor invoice.
    for (const item of collection.invoices) {
      const { data: fresh, error: freshErr } = await admin
        .from("monthly_invoices")
        .select("id, total_amount_cents, amount_paid_cents, balance_cents, status, zoho_invoice_id")
        .eq("id", item.id)
        .maybeSingle();
      if (freshErr) throw new Error(freshErr.message);
      if (!fresh) throw new Error(`invoice_not_found:${item.id}`);

      const status = String((fresh as Record<string, unknown>).status ?? "").toLowerCase();
      if (status === "paid") continue;
      if (!["sent", "partially_paid", "overdue", "draft"].includes(status)) {
        throw new Error(`invoice_not_payable_status:${status || "unknown"}`);
      }

      const total = Math.max(0, Math.round(Number((fresh as Record<string, unknown>).total_amount_cents ?? 0)));
      const prevPaid = Math.max(0, Math.round(Number((fresh as Record<string, unknown>).amount_paid_cents ?? 0)));
      const balance = Math.max(0, Math.round(Number((fresh as Record<string, unknown>).balance_cents ?? total - prevPaid)));
      if (balance <= 0) continue;
      const nextPaid = Math.min(total, prevPaid + balance);

      const { error: upErr } = await admin
        .from("monthly_invoices")
        .update({
          amount_paid_cents: nextPaid,
          status: "paid",
          is_overdue: false,
          payment_arrangement_active: false,
          updated_at: nowIso,
        })
        .eq("id", item.id)
        .in("status", ["draft", "sent", "partially_paid", "overdue"]);
      if (upErr) throw new Error(upErr.message);

      await appendMonthlyInvoiceSnapshotEvent(
        admin,
        item.id,
        {
          kind: "payment_received",
          at: nowIso,
          paystack_charge_reference: ref,
          amount_cents: balance,
          amount_paid_cents_after: nextPaid,
          total_amount_cents: total,
          balance_cents_after: 0,
          settled: "full",
          actor: "system",
          reference: ref,
        },
        { source: "monthly_invoice/account_payment" },
      );

      const { data: bookings, error: bookingsErr } = await admin
        .from("bookings")
        .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
        .eq("monthly_invoice_id", item.id)
        .neq("status", "cancelled");
      if (bookingsErr) throw new Error(bookingsErr.message);

      const child = await settleMonthlyInvoiceChildren(admin, {
        invoiceId: item.id,
        children: (bookings ?? []) as {
          id: string;
          total_paid_zar: number | null;
          amount_paid_cents: number | null;
          display_earnings_cents: number | null;
          cleaner_payout_cents: number | null;
        }[],
        source: "monthly_invoice/account_payment",
        reference: ref,
      });
      if (!child.ok) throw new Error(child.error);

      const zohoInvoiceId = String((fresh as Record<string, unknown>).zoho_invoice_id ?? "").trim();
      if (zohoInvoiceId) {
        zohoAllocations.push({ zohoInvoiceId, amountZar: balance / 100 });
      }
    }
  } catch (err) {
    // The dedup row is removed so reconciliation can retry. Any already-applied invoice rows
    // are idempotent because subsequent passes skip paid rows and continue the remainder.
    await admin.from("monthly_invoice_paystack_charge_dedup").delete().eq("charge_reference", ref);
    return { ok: false, error: err instanceof Error ? err.message : "statement_allocation_failed" };
  }

  if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN && zohoAllocations.length) {
    const zoho = await markZohoInvoiceCollectionPaid({
      invoices: zohoAllocations,
      paymentDate: todayYmdJhb(),
      reference: ref,
    });
    if (!zoho.ok) {
      await reportOperationalIssue("warn", "monthly_invoice/account_payment", "zoho_statement_payment_sync_failed", {
        anchor_invoice_id: collection.anchor.id,
        reference: ref,
        error: zoho.error,
      });
    }
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/account_payment",
    message: "monthly_invoice_statement_payment_applied",
    context: {
      anchor_invoice_id: collection.anchor.id,
      reference: ref,
      amount_cents: paidIn,
      previous_balance_cents: collection.previous_balance_cents,
      invoice_ids: collection.invoices.map((x) => x.id),
    },
  });

  return { ok: true, settled: "full", invoiceId: collection.anchor.id };
}
