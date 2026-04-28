import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daysPastDue } from "@/lib/admin/invoices/invoiceAdminFormatters";

export type AdminInvoiceListRow = {
  id: string;
  customer_id: string;
  month: string;
  status: string;
  total_amount_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  is_overdue: boolean;
  is_closed: boolean;
  due_date: string | null;
  customer_name: string | null;
  currency_code: string;
  account_billing_risk: "ok" | "at_risk";
  days_overdue: number;
  /** Latest `monthly_invoice_events.created_at` for this invoice (service role RPC). */
  last_activity_at: string | null;
  /** From `invoice_adjustments` applied to this invoice (for list badges / filters). */
  has_discount_lines: boolean;
  has_missed_visit_lines: boolean;
};

function num(v: unknown, fallback = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

export async function loadAdminInvoiceList(
  admin: SupabaseClient,
  params: {
    statusFilter: "all" | "paid" | "unpaid" | "overdue";
    search: string;
    balanceGt0Only: boolean;
    hasDiscountLines?: boolean;
    hasMissedVisitLines?: boolean;
  },
): Promise<{ ok: true; rows: AdminInvoiceListRow[] } | { ok: false; error: string }> {
  const { data: invs, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, total_amount_cents, amount_paid_cents, balance_cents, is_overdue, is_closed, due_date, currency_code",
    )
    .order("month", { ascending: false })
    .limit(500);

  if (error) return { ok: false, error: error.message };

  const raw = (invs ?? []) as Record<string, unknown>[];
  const customerIds = [...new Set(raw.map((r) => String(r.customer_id ?? "")).filter(Boolean))];

  const profiles = new Map<string, { full_name: string | null; account_billing_risk: string | null }>();
  if (customerIds.length) {
    const { data: profs, error: pErr } = await admin
      .from("user_profiles")
      .select("id, full_name, account_billing_risk")
      .in("id", customerIds);
    if (pErr) return { ok: false, error: pErr.message };
    for (const p of (profs ?? []) as { id: string; full_name: string | null; account_billing_risk: string | null }[]) {
      profiles.set(p.id, { full_name: p.full_name, account_billing_risk: p.account_billing_risk });
    }
  }

  let rows: AdminInvoiceListRow[] = raw.map((r) => {
    const id = String(r.id ?? "");
    const customer_id = String(r.customer_id ?? "");
    const total = num(r.total_amount_cents);
    const paid = num(r.amount_paid_cents);
    const balRaw = r.balance_cents;
    const balance_cents =
      typeof balRaw === "number" && Number.isFinite(balRaw) ? Math.round(balRaw) : Math.max(0, total - paid);
    const due = typeof r.due_date === "string" ? r.due_date : null;
    const dpd = daysPastDue(due);
    const overdueDays = dpd != null && dpd > 0 && balance_cents > 0 ? dpd : 0;
    const prof = profiles.get(customer_id);
    const riskRaw = String(prof?.account_billing_risk ?? "ok").toLowerCase();
    const account_billing_risk: "ok" | "at_risk" = riskRaw === "at_risk" ? "at_risk" : "ok";
    return {
      id,
      customer_id,
      month: String(r.month ?? ""),
      status: String(r.status ?? "draft"),
      total_amount_cents: total,
      amount_paid_cents: paid,
      balance_cents,
      is_overdue: Boolean(r.is_overdue),
      is_closed: Boolean(r.is_closed),
      due_date: due,
      customer_name: prof?.full_name ?? null,
      currency_code: String(r.currency_code ?? "ZAR"),
      account_billing_risk,
      days_overdue: overdueDays,
      last_activity_at: null,
      has_discount_lines: false,
      has_missed_visit_lines: false,
    };
  });

  const sf = params.statusFilter;
  if (sf === "paid") {
    rows = rows.filter((r) => r.status.toLowerCase() === "paid");
  } else if (sf === "unpaid") {
    rows = rows.filter((r) => ["sent", "partially_paid", "overdue"].includes(r.status.toLowerCase()));
  } else if (sf === "overdue") {
    rows = rows.filter((r) => r.is_overdue || r.status.toLowerCase() === "overdue");
  }

  const q = params.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const name = (r.customer_name ?? "").toLowerCase();
      return name.includes(q) || r.customer_id.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    });
  }

  if (params.balanceGt0Only) {
    rows = rows.filter((r) => r.balance_cents > 0);
  }

  const invIdsForFlags = rows.map((r) => r.id).filter(Boolean);
  const flagByInvoice = new Map<string, { has_discount_lines: boolean; has_missed_visit_lines: boolean }>();
  if (invIdsForFlags.length) {
    const { data: adjRows, error: adjErr } = await admin
      .from("invoice_adjustments")
      .select("applied_to_invoice_id, category")
      .in("applied_to_invoice_id", invIdsForFlags);
    if (adjErr) return { ok: false, error: adjErr.message };
    for (const id of invIdsForFlags) {
      flagByInvoice.set(id, { has_discount_lines: false, has_missed_visit_lines: false });
    }
    for (const raw of (adjRows ?? []) as { applied_to_invoice_id?: string; category?: string }[]) {
      const iid = String(raw.applied_to_invoice_id ?? "");
      const f = flagByInvoice.get(iid);
      if (!f) continue;
      const c = String(raw.category ?? "").toLowerCase();
      if (c === "discount") f.has_discount_lines = true;
      if (c === "missed_visit") f.has_missed_visit_lines = true;
    }
    rows = rows.map((r) => ({
      ...r,
      has_discount_lines: flagByInvoice.get(r.id)?.has_discount_lines ?? false,
      has_missed_visit_lines: flagByInvoice.get(r.id)?.has_missed_visit_lines ?? false,
    }));
  }

  if (params.hasDiscountLines) {
    rows = rows.filter((r) => r.has_discount_lines);
  }
  if (params.hasMissedVisitLines) {
    rows = rows.filter((r) => r.has_missed_visit_lines);
  }

  const lastById = new Map<string, string>();
  const invIds = rows.map((r) => r.id).filter(Boolean);
  if (invIds.length) {
    const { data: lastRows, error: lastErr } = await admin.rpc("monthly_invoice_last_event_times", {
      p_invoice_ids: invIds,
    });
    if (lastErr) return { ok: false, error: lastErr.message };
    for (const raw of (lastRows ?? []) as { invoice_id?: string; last_event_at?: string | null }[]) {
      const iid = String(raw.invoice_id ?? "");
      const lat = raw.last_event_at;
      if (iid && typeof lat === "string" && lat) lastById.set(iid, lat);
    }
  }

  rows = rows.map((r) => ({ ...r, last_activity_at: lastById.get(r.id) ?? null }));

  return { ok: true, rows };
}
