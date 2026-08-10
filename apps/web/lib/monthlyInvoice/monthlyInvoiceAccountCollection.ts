import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyInvoiceCollectionItem = {
  id: string;
  customer_id: string;
  month: string;
  status: string;
  due_date: string | null;
  balance_cents: number;
  payment_arrangement_active: boolean;
  promised_payment_date: string | null;
  zoho_invoice_id: string | null;
};

export type MonthlyInvoiceCollection = {
  anchor: MonthlyInvoiceCollectionItem;
  invoices: MonthlyInvoiceCollectionItem[];
  previous_balance_cents: number;
  current_balance_cents: number;
  collection_total_cents: number;
};

const PAYABLE = new Set(["sent", "partially_paid", "overdue", "draft"]);

function cents(value: unknown): number {
  const n = Math.round(Number(value ?? 0));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Builds the statement-level amount that should be collected when an invoice is paid.
 *
 * Accounting rule:
 * - the anchor/current invoice remains its own invoice;
 * - older open invoices are included only when they have an active payment arrangement;
 * - only arrangements promised on/before the anchor due date are collected;
 * - the returned total is a payment request / account statement total, not a mutation of
 *   the current invoice total, so revenue and AR are never double-counted.
 */
export async function loadMonthlyInvoiceCollection(
  admin: SupabaseClient,
  anchorInvoiceId: string,
): Promise<{ ok: true; collection: MonthlyInvoiceCollection } | { ok: false; error: string }> {
  const { data: anchorRaw, error: anchorErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, due_date, balance_cents, payment_arrangement_active, promised_payment_date, zoho_invoice_id",
    )
    .eq("id", anchorInvoiceId)
    .maybeSingle();

  if (anchorErr) return { ok: false, error: anchorErr.message };
  if (!anchorRaw) return { ok: false, error: "invoice_not_found" };

  const anchor = anchorRaw as Record<string, unknown>;
  const anchorStatus = String(anchor.status ?? "").toLowerCase();
  if (!PAYABLE.has(anchorStatus)) return { ok: false, error: "invoice_not_payable" };

  const anchorItem: MonthlyInvoiceCollectionItem = {
    id: String(anchor.id),
    customer_id: String(anchor.customer_id),
    month: String(anchor.month ?? ""),
    status: anchorStatus,
    due_date: typeof anchor.due_date === "string" ? anchor.due_date.slice(0, 10) : null,
    balance_cents: cents(anchor.balance_cents),
    payment_arrangement_active: Boolean(anchor.payment_arrangement_active),
    promised_payment_date:
      typeof anchor.promised_payment_date === "string" ? anchor.promised_payment_date.slice(0, 10) : null,
    zoho_invoice_id: typeof anchor.zoho_invoice_id === "string" ? anchor.zoho_invoice_id : null,
  };

  if (anchorItem.balance_cents <= 0) return { ok: false, error: "invoice_nothing_due" };

  const { data: priorRows, error: priorErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, due_date, balance_cents, payment_arrangement_active, promised_payment_date, zoho_invoice_id",
    )
    .eq("customer_id", anchorItem.customer_id)
    .eq("payment_arrangement_active", true)
    .neq("id", anchorItem.id)
    .lt("month", anchorItem.month)
    .gt("balance_cents", 0)
    .eq("is_closed", false)
    .order("month", { ascending: true });

  if (priorErr) return { ok: false, error: priorErr.message };

  const prior: MonthlyInvoiceCollectionItem[] = [];
  for (const raw of (priorRows ?? []) as Record<string, unknown>[]) {
    const status = String(raw.status ?? "").toLowerCase();
    if (!PAYABLE.has(status)) continue;
    const promised = typeof raw.promised_payment_date === "string" ? raw.promised_payment_date.slice(0, 10) : null;
    // An arrangement without a promise date is not safe to auto-collect with another month.
    if (!promised) continue;
    if (anchorItem.due_date && promised > anchorItem.due_date) continue;
    const balance = cents(raw.balance_cents);
    if (balance <= 0) continue;
    prior.push({
      id: String(raw.id),
      customer_id: String(raw.customer_id),
      month: String(raw.month ?? ""),
      status,
      due_date: typeof raw.due_date === "string" ? raw.due_date.slice(0, 10) : null,
      balance_cents: balance,
      payment_arrangement_active: true,
      promised_payment_date: promised,
      zoho_invoice_id: typeof raw.zoho_invoice_id === "string" ? raw.zoho_invoice_id : null,
    });
  }

  const previous = prior.reduce((sum, inv) => sum + inv.balance_cents, 0);
  return {
    ok: true,
    collection: {
      anchor: anchorItem,
      invoices: [...prior, anchorItem],
      previous_balance_cents: previous,
      current_balance_cents: anchorItem.balance_cents,
      collection_total_cents: previous + anchorItem.balance_cents,
    },
  };
}
