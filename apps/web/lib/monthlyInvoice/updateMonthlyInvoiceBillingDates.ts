import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { isMonthlyInvoiceOverdueWithGrace } from "@/lib/monthlyInvoice/monthlyInvoiceLateFeePolicy";
import { billingMonthInvoiceDate } from "@/lib/monthlyInvoice/monthlyInvoiceBillingDates";
import { updateZohoInvoiceDates } from "@/lib/zoho/zohoBooksService";

function parseYmd(raw: unknown): string | null {
  const ymd = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export type UpdateMonthlyInvoiceBillingDatesResult =
  | {
      ok: true;
      dueDate: string;
      invoiceDate: string;
      zohoSynced: boolean;
      zohoError?: string;
    }
  | { ok: false; error: string };

/**
 * Admin edit of monthly invoice document date + payment due date.
 * Allowed for any non-closed invoice (draft, sent, partially paid, overdue, paid).
 */
export async function updateMonthlyInvoiceBillingDates(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    dueDate?: string | null;
    invoiceDate?: string | null;
    adminEmail?: string;
  },
): Promise<UpdateMonthlyInvoiceBillingDatesResult> {
  const dueIn = params.dueDate === undefined ? undefined : parseYmd(params.dueDate);
  const invIn = params.invoiceDate === undefined ? undefined : parseYmd(params.invoiceDate);

  if (params.dueDate !== undefined && params.dueDate !== null && !dueIn) {
    return { ok: false, error: "invalid_due_date" };
  }
  if (params.invoiceDate !== undefined && params.invoiceDate !== null && !invIn) {
    return { ok: false, error: "invalid_invoice_date" };
  }
  if (dueIn === undefined && invIn === undefined) {
    return { ok: false, error: "no_dates_provided" };
  }

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, month, status, is_closed, due_date, invoice_date, zoho_invoice_id, total_amount_cents, amount_paid_cents, balance_cents",
    )
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  if (!inv) return { ok: false, error: "not_found" };

  const row = inv as {
    id: string;
    month: string;
    status: string | null;
    is_closed: boolean | null;
    due_date: string | null;
    invoice_date?: string | null;
    zoho_invoice_id?: string | null;
    total_amount_cents?: number | null;
    amount_paid_cents?: number | null;
    balance_cents?: number | null;
  };

  if (row.is_closed) return { ok: false, error: "invoice_already_closed" };

  const status = String(row.status ?? "").toLowerCase();
  const month = String(row.month ?? "").trim();
  const nextDue = dueIn ?? parseYmd(row.due_date) ?? billingMonthInvoiceDate(month);
  const nextInvoiceDate =
    invIn ?? parseYmd(row.invoice_date) ?? billingMonthInvoiceDate(month);

  // Draft due overrides must stay in the billing month so recompute stays consistent.
  if (status === "draft" && dueIn && month && !dueIn.startsWith(month)) {
    return { ok: false, error: "due_date_must_be_in_billing_month" };
  }

  const balanceCents = Math.max(
    0,
    Math.round(
      Number(
        row.balance_cents ??
          Math.max(0, Number(row.total_amount_cents ?? 0) - Number(row.amount_paid_cents ?? 0)),
      ),
    ),
  );
  const settled = status === "paid" || balanceCents <= 0;
  const isOverdue = !settled && isMonthlyInvoiceOverdueWithGrace(nextDue);

  const patch: Record<string, unknown> = {
    due_date: nextDue,
    invoice_date: nextInvoiceDate,
    is_overdue: isOverdue,
    updated_at: new Date().toISOString(),
  };
  if (status === "draft" && dueIn) {
    patch.due_date_override = dueIn;
  }

  const { error: upErr } = await admin.from("monthly_invoices").update(patch).eq("id", row.id);
  if (upErr) {
    const msg = String(upErr.message ?? "");
    // Pre-migration fallback: column may not exist yet in some environments.
    if (msg.includes("invoice_date")) {
      const { invoice_date: _drop, ...withoutInvoiceDate } = patch;
      const { error: fallbackErr } = await admin
        .from("monthly_invoices")
        .update(withoutInvoiceDate)
        .eq("id", row.id);
      if (fallbackErr) return { ok: false, error: fallbackErr.message };
    } else {
      return { ok: false, error: upErr.message };
    }
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/admin_billing_dates",
    message: "monthly_invoice_billing_dates_updated",
    context: {
      invoice_id: row.id,
      admin_email: params.adminEmail ?? null,
      due_date: nextDue,
      invoice_date: nextInvoiceDate,
      previous_due_date: row.due_date,
      previous_invoice_date: row.invoice_date ?? null,
    },
  });

  let zohoSynced = false;
  let zohoError: string | undefined;
  const zohoId = String(row.zoho_invoice_id ?? "").trim();
  if (zohoId && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    const zohoRes = await updateZohoInvoiceDates({
      zohoInvoiceId: zohoId,
      invoiceDate: nextInvoiceDate,
      dueDate: nextDue,
    });
    if (zohoRes.ok) {
      zohoSynced = true;
    } else {
      zohoError = zohoRes.error;
      await logSystemEvent({
        level: "warn",
        source: "monthly_invoice/admin_billing_dates",
        message: "monthly_invoice_zoho_dates_update_failed",
        context: {
          invoice_id: row.id,
          zoho_invoice_id: zohoId,
          error: zohoRes.error,
        },
      });
    }
  }

  return {
    ok: true,
    dueDate: nextDue,
    invoiceDate: nextInvoiceDate,
    zohoSynced,
    ...(zohoError ? { zohoError } : {}),
  };
}

/** Effective invoice/document date for Zoho + display. */
export function resolveMonthlyInvoiceDocumentDate(row: {
  month: string;
  invoice_date?: string | null;
}): string {
  return parseYmd(row.invoice_date) ?? billingMonthInvoiceDate(row.month);
}
