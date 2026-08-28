import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";
import { resolveZohoCustomerContactForMonthlyInvoice } from "@/lib/zoho/resolveZohoCustomerContact";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";

/**
 * Records full settlement without Paystack (offline / ops). Allowed for sent / partially_paid / overdue only.
 * After local settlement, syncs payment to Zoho Books when a linked invoice exists (non-blocking).
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
    .select("id, status, total_amount_cents, amount_paid_cents, is_closed, zoho_invoice_id, customer_id")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "invoice_not_found" };

  const row = inv as {
    id: string;
    status: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    is_closed: boolean | null;
    zoho_invoice_id?: string | null;
    customer_id?: string | null;
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
  if (remaining <= 0) return { ok: false, error: "nothing_to_record_manual_payment" };

  const nowIso = new Date().toISOString();
  const manualReference = `manual:monthly_invoice:${row.id}`;

  const { error: ledgerErr } = await admin.from("payment_transactions").insert({
    gateway: "other",
    gateway_reference: manualReference,
    gateway_transaction_id: null,
    entity_type: "monthly_invoice",
    entity_id: row.id,
    amount_cents: remaining,
    currency_code: "ZAR",
    processing_fee_cents: 0,
    processing_fee_vat_cents: 0,
    net_settlement_cents: remaining,
    fee_calculation_method: "manual",
    settlement_status: "settled",
    settlement_date: todayYmdJhb(),
    payment_channel: "manual_eft",
    paid_at: nowIso,
    sync_status: "not_synced",
  });
  if (ledgerErr) return { ok: false, error: ledgerErr.message };

  const rollbackLedger = async () => {
    await admin
      .from("payment_transactions")
      .delete()
      .eq("gateway", "other")
      .eq("gateway_reference", manualReference);
  };

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
      reference: manualReference,
      ...(noteTrim ? { note: noteTrim } : {}),
      settled: "full",
    },
    { source: "monthly_invoice/admin_manual" },
  );
  if (!appendRes.ok) {
    await rollbackLedger();
    return { ok: false, error: appendRes.error };
  }

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

  if (upInv) {
    await rollbackLedger();
    return { ok: false, error: upInv.message };
  }

  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
    .eq("monthly_invoice_id", row.id)
    .neq("status", "cancelled");

  if (bErr) return { ok: false, error: bErr.message };

  const childSettlement = await settleMonthlyInvoiceChildren(admin, {
    invoiceId: row.id,
    children: (bookings ?? []) as {
      id: string;
      total_paid_zar: number | null;
      amount_paid_cents: number | null;
      display_earnings_cents: number | null;
      cleaner_payout_cents: number | null;
    }[],
    source: "monthly_invoice/admin_manual",
    reference: manualReference,
  });
  if (!childSettlement.ok) {
    return { ok: false, error: childSettlement.error };
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/admin_manual",
    message: "monthly_invoice_marked_paid_manual",
    context: {
      invoice_id: row.id,
      admin_email: params.adminEmail,
      amount_recorded_cents: remaining,
      payment_reference: manualReference,
      note: noteTrim,
    },
  });

  // Sync payment to Zoho Books (non-blocking — failures are logged but don't fail settlement)
  const zohoInvoiceId = String(row.zoho_invoice_id ?? "").trim();
  const customerId = String(row.customer_id ?? "").trim();
  if (zohoInvoiceId && customerId && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    try {
      const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
        invoiceId: row.id,
        customerId,
      });
      if (contactRes.ok) {
        const payRes = await markZohoInvoicePaid({
          zohoInvoiceId,
          amountZar: capPaid / 100,
          paymentDate: todayYmdJhb(),
          reference: manualReference,
          customerEmail: contactRes.contact.email,
          customerName: contactRes.contact.name,
        });
        if (!payRes.ok) {
          await logSystemEvent({
            level: "warn",
            source: "monthly_invoice/admin_manual",
            message: "monthly_invoice_zoho_mark_paid_failed",
            context: {
              invoice_id: row.id,
              zoho_invoice_id: zohoInvoiceId,
              error: payRes.error,
            },
          });
        }
      } else {
        await logSystemEvent({
          level: "warn",
          source: "monthly_invoice/admin_manual",
          message: "monthly_invoice_zoho_contact_resolve_failed",
          context: {
            invoice_id: row.id,
            zoho_invoice_id: zohoInvoiceId,
            error: contactRes.error,
          },
        });
      }
    } catch (err) {
      await logSystemEvent({
        level: "warn",
        source: "monthly_invoice/admin_manual",
        message: "monthly_invoice_zoho_mark_paid_threw",
        context: {
          invoice_id: row.id,
          zoho_invoice_id: zohoInvoiceId,
          error: String(err instanceof Error ? err.message : err),
        },
      });
    }
  }

  return { ok: true };
}
