import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveMonthlyInvoicePaymentSource,
  type MonthlyInvoicePaymentSource,
} from "@/lib/admin/invoices/monthlyInvoicePaymentSource";

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
  last_activity_at: string | null;
  booking_count: number;
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
  pageSize: number;
  total: number;
  totalMonths: number;
  totalPages: number;
  from: number;
  to: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type RpcInvoiceRow = Omit<AdminInvoiceListRow, "payment_source"> & {
  payment_event_kinds?: string[] | null;
  has_paystack_evidence?: boolean | null;
  closure_reason?: string | null;
};

type RpcPayload = {
  rows?: RpcInvoiceRow[] | null;
  summary?: Partial<AdminInvoiceListSummary> | null;
  pagination?: Partial<AdminInvoiceListPagination> | null;
};

function num(v: unknown, fallback = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function textOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function isSettledInvoice(status: string, balanceCents: number): boolean {
  const st = status.toLowerCase();
  return st === "paid" || st === "refunded" || balanceCents <= 0;
}

/**
 * Kept as a pure helper for focused financial-truth tests.
 * Production list summaries are calculated in PostgreSQL by
 * admin_monthly_invoice_list_v1.
 */
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

function parseRow(raw: RpcInvoiceRow): AdminInvoiceListRow {
  const status = String(raw.status ?? "draft").toLowerCase();
  const total = num(raw.total_amount_cents);
  const paid = num(raw.amount_paid_cents);
  const balance = num(raw.balance_cents, Math.max(0, total - paid));
  const eventKinds = Array.isArray(raw.payment_event_kinds)
    ? raw.payment_event_kinds.map((kind) => String(kind))
    : [];

  return {
    id: String(raw.id ?? ""),
    customer_id: String(raw.customer_id ?? ""),
    month: String(raw.month ?? ""),
    status,
    total_amount_cents: total,
    amount_paid_cents: paid,
    balance_cents: balance,
    is_overdue: bool(raw.is_overdue),
    is_closed: bool(raw.is_closed),
    due_date: textOrNull(raw.due_date),
    customer_name: textOrNull(raw.customer_name),
    currency_code: String(raw.currency_code ?? "ZAR"),
    account_billing_risk:
      String(raw.account_billing_risk ?? "").toLowerCase() === "at_risk" ? "at_risk" : "ok",
    days_overdue: Math.max(0, num(raw.days_overdue)),
    last_activity_at: textOrNull(raw.last_activity_at),
    booking_count: Math.max(0, num(raw.booking_count)),
    has_discount_lines: bool(raw.has_discount_lines),
    has_missed_visit_lines: bool(raw.has_missed_visit_lines),
    view_count: Math.max(0, num(raw.view_count)),
    first_viewed_at: textOrNull(raw.first_viewed_at),
    zoho_invoice_number: textOrNull(raw.zoho_invoice_number),
    display_reference: String(raw.display_reference ?? ""),
    sync_hold_reason: textOrNull(raw.sync_hold_reason),
    date_context: raw.date_context === "last_visit" ? "last_visit" : "due",
    payment_source: resolveMonthlyInvoicePaymentSource({
      status,
      totalAmountCents: total,
      amountPaidCents: paid,
      closureReason: textOrNull(raw.closure_reason),
      eventKinds,
      hasPaystackLedger: bool(raw.has_paystack_evidence),
    }),
  };
}

function parseSummary(raw: RpcPayload["summary"]): AdminInvoiceListSummary {
  return {
    total_invoices: Math.max(0, num(raw?.total_invoices)),
    paid_count: Math.max(0, num(raw?.paid_count)),
    overdue_count: Math.max(0, num(raw?.overdue_count)),
    collectible_outstanding_cents: Math.max(0, num(raw?.collectible_outstanding_cents)),
    draft_forecast_cents: Math.max(0, num(raw?.draft_forecast_cents)),
    total_outstanding_cents: Math.max(0, num(raw?.total_outstanding_cents)),
  };
}

function parsePagination(raw: RpcPayload["pagination"]): AdminInvoiceListPagination | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    page: Math.max(1, num(raw.page, 1)),
    pageSize: Math.max(1, num(raw.pageSize, 3)),
    total: Math.max(0, num(raw.total)),
    totalMonths: Math.max(0, num(raw.totalMonths)),
    totalPages: Math.max(1, num(raw.totalPages, 1)),
    from: Math.max(0, num(raw.from)),
    to: Math.max(0, num(raw.to)),
    hasNextPage: bool(raw.hasNextPage),
    hasPreviousPage: bool(raw.hasPreviousPage),
  };
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
  const paginate = params.page != null && params.monthsPerPage != null;
  const page = Math.max(1, Math.round(params.page ?? 1));
  const monthsPerPage = Math.max(1, Math.min(12, Math.round(params.monthsPerPage ?? 3)));

  const { data, error } = await admin.rpc("admin_monthly_invoice_list_v1", {
    p_status: params.statusFilter,
    p_search: params.search.trim(),
    p_balance_gt0: params.balanceGt0Only,
    p_has_discount_lines: Boolean(params.hasDiscountLines),
    p_has_missed_visit_lines: Boolean(params.hasMissedVisitLines),
    p_page: page,
    p_months_per_page: monthsPerPage,
    p_paginate: paginate,
  });

  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "admin_monthly_invoice_list_v1 returned an invalid payload." };
  }

  const payload = data as RpcPayload;
  const rows = (Array.isArray(payload.rows) ? payload.rows : []).map(parseRow);
  const summary = parseSummary(payload.summary);
  const pagination = parsePagination(payload.pagination);

  return {
    ok: true,
    rows,
    ...(paginate ? { monthGroups: groupInvoicesByMonth(rows) } : {}),
    ...(pagination ? { pagination } : {}),
    summary,
  };
}
