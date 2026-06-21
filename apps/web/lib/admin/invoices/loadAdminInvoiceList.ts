import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daysOverdueForDisplay, isInvoiceOverdueForDisplay } from "@/lib/admin/invoices/invoiceAdminFormatters";

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
  /** Non-cancelled child bookings linked to this invoice. */
  booking_count: number;
  /** From `invoice_adjustments` applied to this invoice (for list badges / filters). */
  has_discount_lines: boolean;
  has_missed_visit_lines: boolean;
};

export type AdminInvoiceMonthGroup = {
  month: string;
  invoices: AdminInvoiceListRow[];
};

export type AdminInvoiceListSummary = {
  total_invoices: number;
  paid_count: number;
  overdue_count: number;
  total_outstanding_cents: number;
};

export type AdminInvoiceListPagination = {
  page: number;
  /** Calendar months shown per page (each month is kept intact). */
  pageSize: number;
  total: number;
  totalMonths: number;
  totalPages: number;
  from: number;
  to: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

function num(v: unknown, fallback = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function buildInvoiceSummary(rows: AdminInvoiceListRow[]): AdminInvoiceListSummary {
  let paid_count = 0;
  let overdue_count = 0;
  let total_outstanding_cents = 0;
  for (const inv of rows) {
    if (inv.status.toLowerCase() === "paid") paid_count += 1;
    if (inv.is_overdue || inv.status.toLowerCase() === "overdue") overdue_count += 1;
    total_outstanding_cents += Math.max(0, inv.balance_cents);
  }
  return {
    total_invoices: rows.length,
    paid_count,
    overdue_count,
    total_outstanding_cents,
  };
}

function groupInvoicesByMonth(rows: AdminInvoiceListRow[]): AdminInvoiceMonthGroup[] {
  const byMonth = new Map<string, AdminInvoiceListRow[]>();
  for (const row of rows) {
    const month = row.month || "unknown";
    const list = byMonth.get(month);
    if (list) list.push(row);
    else byMonth.set(month, [row]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, invoices]) => ({ month, invoices }));
}

export async function loadAdminInvoiceList(
  admin: SupabaseClient,
  params: {
    statusFilter: "all" | "paid" | "unpaid" | "overdue";
    search: string;
    balanceGt0Only: boolean;
    hasDiscountLines?: boolean;
    hasMissedVisitLines?: boolean;
    page?: number;
    monthsPerPage?: number;
  },
): Promise<
  | {
      ok: true;
      rows: AdminInvoiceListRow[];
      monthGroups?: AdminInvoiceMonthGroup[];
      pagination?: AdminInvoiceListPagination;
      summary?: AdminInvoiceListSummary;
    }
  | { ok: false; error: string }
> {
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

  const bookingStatsByInvoice = new Map<string, { count: number; lastVisitYmd: string | null }>();
  const invoiceIdsForCounts = raw.map((r) => String(r.id ?? "")).filter(Boolean);
  if (invoiceIdsForCounts.length) {
    const { data: bookingRows, error: bkErr } = await admin
      .from("bookings")
      .select("monthly_invoice_id, date")
      .in("monthly_invoice_id", invoiceIdsForCounts)
      .neq("status", "cancelled");
    if (bkErr) return { ok: false, error: bkErr.message };
    for (const row of (bookingRows ?? []) as { monthly_invoice_id?: string | null; date?: string }[]) {
      const invoiceId = String(row.monthly_invoice_id ?? "");
      if (!invoiceId) continue;
      const visitYmd = String(row.date ?? "").slice(0, 10);
      const cur = bookingStatsByInvoice.get(invoiceId) ?? { count: 0, lastVisitYmd: null };
      cur.count += 1;
      if (/^\d{4}-\d{2}-\d{2}$/.test(visitYmd)) {
        if (!cur.lastVisitYmd || visitYmd > cur.lastVisitYmd) cur.lastVisitYmd = visitYmd;
      }
      bookingStatsByInvoice.set(invoiceId, cur);
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
    const monthYm = String(r.month ?? "");
    const stats = bookingStatsByInvoice.get(id);
    const statusLower = String(r.status ?? "draft").toLowerCase();
    let due = typeof r.due_date === "string" ? r.due_date : null;
    if (statusLower === "draft" && stats?.lastVisitYmd?.startsWith(monthYm)) {
      due = stats.lastVisitYmd;
    }
    const overdueDays = daysOverdueForDisplay(due);
    const displayOverdue = isInvoiceOverdueForDisplay(due, balance_cents);
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
      is_overdue: Boolean(r.is_overdue) || displayOverdue,
      is_closed: Boolean(r.is_closed),
      due_date: due,
      customer_name: prof?.full_name ?? null,
      currency_code: String(r.currency_code ?? "ZAR"),
      account_billing_risk,
      days_overdue: overdueDays,
      last_activity_at: null,
      booking_count: stats?.count ?? 0,
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

  const summary = buildInvoiceSummary(rows);

  if (params.page != null && params.monthsPerPage != null) {
    const monthsPerPage = Math.max(1, Math.min(12, Math.round(params.monthsPerPage)));
    const allGroups = groupInvoicesByMonth(rows);
    const totalMonths = allGroups.length;
    const totalPages = Math.max(1, Math.ceil(totalMonths / monthsPerPage));
    const page = Math.min(Math.max(1, Math.round(params.page)), totalPages);
    const startIdx = (page - 1) * monthsPerPage;
    const monthGroups = allGroups.slice(startIdx, startIdx + monthsPerPage);
    const pageRows = monthGroups.flatMap((g) => g.invoices);

    let invoiceOffset = 0;
    for (let i = 0; i < startIdx; i += 1) {
      invoiceOffset += allGroups[i]?.invoices.length ?? 0;
    }
    const pageInvoiceCount = pageRows.length;

    return {
      ok: true,
      rows: pageRows,
      monthGroups,
      summary,
      pagination: {
        page,
        pageSize: monthsPerPage,
        total: rows.length,
        totalMonths,
        totalPages,
        from: pageInvoiceCount > 0 ? invoiceOffset + 1 : 0,
        to: pageInvoiceCount > 0 ? invoiceOffset + pageInvoiceCount : 0,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  return { ok: true, rows, summary };
}
