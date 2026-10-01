import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daysOverdueForDisplay, isInvoiceOverdueForDisplay } from "@/lib/admin/invoices/invoiceAdminFormatters";
import {
  resolveMonthlyInvoicePaymentSource,
  type MonthlyInvoicePaymentSource,
} from "@/lib/admin/invoices/monthlyInvoicePaymentSource";
import { assessMonthlyInvoiceFinalizeReadiness } from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { resolveMonthlyInvoiceCustomerEmail } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { formatZohoOrderReference } from "@/lib/zoho/zohoOrderReference";

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
  view_count: number;
  first_viewed_at: string | null;
  zoho_invoice_number: string | null;
  display_reference: string;
  sync_hold_reason: string | null;
  date_context: "last_visit" | "due";
  payment_source: MonthlyInvoicePaymentSource;
};

export type AdminInvoiceMonthGroup = {
  month: string;
  invoices: AdminInvoiceListRow[];
};

export type AdminInvoiceListSummary = {
  total_invoices: number;
  paid_count: number;
  overdue_count: number;
  collectible_outstanding_cents: number;
  draft_forecast_cents: number;
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

function isSettledInvoice(status: string, balanceCents: number): boolean {
  const st = status.toLowerCase();
  return st === "paid" || st === "refunded" || balanceCents <= 0;
}

export function buildInvoiceSummary(rows: AdminInvoiceListRow[]): AdminInvoiceListSummary {
  let paid_count = 0;
  let overdue_count = 0;
  let collectible_outstanding_cents = 0;
  let draft_forecast_cents = 0;
  let total_outstanding_cents = 0;

  for (const inv of rows) {
    const status = inv.status.toLowerCase();
    const balance = Math.max(0, inv.balance_cents);

    if (status === "paid") paid_count += 1;
    if (!isSettledInvoice(status, balance) && inv.is_overdue) overdue_count += 1;

    if (!inv.is_closed && status === "draft") {
      draft_forecast_cents += balance;
    } else if (!inv.is_closed && ["sent", "partially_paid", "overdue"].includes(status)) {
      collectible_outstanding_cents += balance;
    }

    if (!inv.is_closed) total_outstanding_cents += balance;
  }

  return {
    total_invoices: rows.length,
    paid_count,
    overdue_count,
    collectible_outstanding_cents,
    draft_forecast_cents,
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
    statusFilter: "all" | "draft" | "sent" | "paid" | "unpaid" | "overdue" | "held" | "unviewed";
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
      "id, customer_id, month, status, total_amount_cents, amount_paid_cents, balance_cents, is_overdue, is_closed, due_date, currency_code, view_count, first_viewed_at, zoho_invoice_number, closure_reason",
    )
    .order("month", { ascending: false })
    .limit(500);

  if (error) return { ok: false, error: error.message };

  const raw = (invs ?? []) as Record<string, unknown>[];
  const allInvoiceIds = raw.map((r) => String(r.id ?? "")).filter(Boolean);
  const eventKindsByInvoice = new Map<string, string[]>();
  const paystackEvidence = new Set<string>();

  if (allInvoiceIds.length) {
    const [eventsRes, dedupRes, ledgerRes] = await Promise.all([
      admin
        .from("monthly_invoice_events")
        .select("invoice_id, kind, created_at")
        .in("invoice_id", allInvoiceIds)
        .in("kind", [
          "payment_received",
          "payment_applied",
          "admin_mark_paid",
          "admin_revert_to_draft",
          "cleaning_credit_applied",
          "cleaning_credit_settled",
        ]),
      admin
        .from("monthly_invoice_paystack_charge_dedup")
        .select("invoice_id")
        .in("invoice_id", allInvoiceIds),
      admin
        .from("payment_transactions")
        .select("entity_id")
        .eq("entity_type", "monthly_invoice")
        .eq("gateway", "paystack")
        .in("entity_id", allInvoiceIds),
    ]);

    if (eventsRes.error) return { ok: false, error: eventsRes.error.message };
    if (dedupRes.error) return { ok: false, error: dedupRes.error.message };
    if (ledgerRes.error) return { ok: false, error: ledgerRes.error.message };

    const eventsByInvoice = new Map<string, Array<{ kind: string; createdAt: string }>>();
    for (const e of (eventsRes.data ?? []) as { invoice_id?: string | null; kind?: string | null; created_at?: string | null }[]) {
      const invoiceId = String(e.invoice_id ?? "");
      const kind = String(e.kind ?? "");
      if (!invoiceId || !kind) continue;
      const list = eventsByInvoice.get(invoiceId) ?? [];
      list.push({ kind, createdAt: String(e.created_at ?? "") });
      eventsByInvoice.set(invoiceId, list);
    }
    for (const [invoiceId, events] of eventsByInvoice) {
      events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      eventKindsByInvoice.set(invoiceId, events.map((event) => event.kind));
    }
    for (const d of (dedupRes.data ?? []) as { invoice_id?: string | null }[]) {
      const invoiceId = String(d.invoice_id ?? "");
      if (invoiceId) paystackEvidence.add(invoiceId);
    }
    for (const t of (ledgerRes.data ?? []) as { entity_id?: string | null }[]) {
      const invoiceId = String(t.entity_id ?? "");
      if (invoiceId) paystackEvidence.add(invoiceId);
    }
  }

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

  const bookingStatsByInvoice = new Map<string, { count: number; lastVisitYmd: string | null; openCount: number }>();
  const invoiceIdsForCounts = raw.map((r) => String(r.id ?? "")).filter(Boolean);
  if (invoiceIdsForCounts.length) {
    const { data: bookingRows, error: bkErr } = await admin
      .from("bookings")
      .select("monthly_invoice_id, date, status")
      .in("monthly_invoice_id", invoiceIdsForCounts)
      .neq("status", "cancelled");
    if (bkErr) return { ok: false, error: bkErr.message };
    for (const row of (bookingRows ?? []) as { monthly_invoice_id?: string | null; date?: string; status?: string | null }[]) {
      const invoiceId = String(row.monthly_invoice_id ?? "");
      if (!invoiceId) continue;
      const visitYmd = String(row.date ?? "").slice(0, 10);
      const cur = bookingStatsByInvoice.get(invoiceId) ?? { count: 0, lastVisitYmd: null, openCount: 0 };
      cur.count += 1;
      const bookingStatus = String(row.status ?? "").toLowerCase();
      if (bookingStatus !== "completed" && bookingStatus !== "cancelled") cur.openCount += 1;
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
    const overdueDays = isSettledInvoice(statusLower, balance_cents) ? 0 : daysOverdueForDisplay(due);
    const displayOverdue = isSettledInvoice(statusLower, balance_cents)
      ? false
      : isInvoiceOverdueForDisplay(due, balance_cents);
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
      // Display truth is derived from the same 5-day grace policy as the overdue RPC.
      // Do not let a stale persisted flag make the list/KPI disagree with the policy.
      is_overdue: isSettledInvoice(statusLower, balance_cents) ? false : displayOverdue,
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
      view_count: Math.max(0, num(r.view_count)),
      first_viewed_at: typeof r.first_viewed_at === "string" ? r.first_viewed_at : null,
      zoho_invoice_number:
        typeof r.zoho_invoice_number === "string" && r.zoho_invoice_number.trim()
          ? r.zoho_invoice_number.trim()
          : null,
      display_reference:
        typeof r.zoho_invoice_number === "string" && r.zoho_invoice_number.trim()
          ? r.zoho_invoice_number.trim()
          : formatZohoOrderReference(id, "monthly"),
      sync_hold_reason: null,
      date_context: statusLower === "draft" ? "last_visit" : "due",
      payment_source: resolveMonthlyInvoicePaymentSource({
        status: statusLower,
        totalAmountCents: total,
        amountPaidCents: paid,
        closureReason: typeof r.closure_reason === "string" ? r.closure_reason : null,
        eventKinds: eventKindsByInvoice.get(id) ?? [],
        hasPaystackLedger: paystackEvidence.has(id),
      }),
    };
  });

  // Drafts need an operational reason, not just a generic "Draft" badge.
  // Reuse the same readiness/contact truth used by the billing sync surface.
  for (const row of rows) {
    if (row.status.toLowerCase() !== "draft" || row.is_closed || row.total_amount_cents <= 0) continue;
    const stats = bookingStatsByInvoice.get(row.id);
    if ((stats?.openCount ?? 0) > 0) {
      row.sync_hold_reason = "Open booking";
      continue;
    }
    const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
      invoiceId: row.id,
      customerId: row.customer_id,
      month: row.month,
      todayYmd: todayJohannesburg(),
    });
    if (!readiness.ready) {
      row.sync_hold_reason =
        readiness.reason === "recurring_schedule_incomplete"
          ? "Schedule incomplete"
          : readiness.reason === "invoice_month_not_ended"
            ? "Month still open"
            : readiness.reason === "upcoming_visits_in_month"
              ? "Upcoming visit"
              : "Not ready";
      continue;
    }
    const outboundEmail = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!outboundEmail) row.sync_hold_reason = "Contact required";
  }

  const sf = params.statusFilter;
  if (sf === "paid") {
    rows = rows.filter((r) => r.status.toLowerCase() === "paid");
  } else if (sf === "draft") {
    rows = rows.filter((r) => r.status.toLowerCase() === "draft");
  } else if (sf === "sent") {
    rows = rows.filter((r) => ["sent", "partially_paid"].includes(r.status.toLowerCase()) && !r.is_overdue);
  } else if (sf === "unpaid") {
    rows = rows.filter((r) => ["sent", "partially_paid", "overdue"].includes(r.status.toLowerCase()));
  } else if (sf === "overdue") {
    rows = rows.filter((r) => r.is_overdue);
  } else if (sf === "held") {
    rows = rows.filter((r) => r.status.toLowerCase() === "draft" && Boolean(r.sync_hold_reason));
  } else if (sf === "unviewed") {
    rows = rows.filter(
      (r) => ["sent", "partially_paid", "overdue"].includes(r.status.toLowerCase()) && r.view_count === 0,
    );
  }

  const q = params.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const name = (r.customer_name ?? "").toLowerCase();
      return (
        name.includes(q) ||
        r.customer_id.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.display_reference.toLowerCase().includes(q) ||
        (r.zoho_invoice_number ?? "").toLowerCase().includes(q) ||
        r.month.toLowerCase().includes(q)
      );
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
