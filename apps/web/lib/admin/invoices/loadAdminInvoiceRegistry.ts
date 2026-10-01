import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminInvoiceRegistryKind =
  | "quote"
  | "sales_invoice"
  | "booking_invoice"
  | "monthly_invoice";

export type AdminInvoiceRegistryKindFilter =
  | "all"
  | "invoices"
  | AdminInvoiceRegistryKind;

export type AdminInvoiceRegistryStatusFilter =
  | "all"
  | "paid"
  | "unpaid"
  | "draft"
  | "sent"
  | "overdue"
  | "missing_zoho";

export type AdminInvoiceRegistryRow = {
  registry_id: string;
  entity_id: string;
  kind: AdminInvoiceRegistryKind;
  origin: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  amount_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  status: string;
  is_closed: boolean;
  is_overdue: boolean;
  created_at: string;
  due_date: string | null;
  view_count: number;
  first_viewed_at: string | null;
  zoho_linked: boolean;
  zoho_id: string | null;
  zoho_number: string | null;
  zoho_status: string | null;
  zoho_balance_cents: number | null;
  href: string;
  pdf_href: string | null;
  payment_source: string;
  is_quote: boolean;
  is_invoice: boolean;
  sync_eligible: boolean;
  sync_hold_reason: string | null;
  period_label: string | null;
};

export type AdminInvoiceRegistrySummary = {
  total_documents: number;
  invoice_count: number;
  quote_count: number;
  paid_count: number;
  overdue_count: number;
  zoho_linked_count: number;
  missing_zoho_count: number;
  outstanding_cents: number;
  invoiced_cents: number;
  by_kind: Record<string, number>;
};

export type AdminInvoiceRegistryPagination = {
  page: number;
  page_size: number;
  total_filtered: number;
  total_pages: number;
  from: number;
  to: number;
  has_next_page: boolean;
  has_previous_page: boolean;
};

export type AdminInvoiceRegistryPayload = {
  rows: AdminInvoiceRegistryRow[];
  summary: AdminInvoiceRegistrySummary;
  pagination: AdminInvoiceRegistryPagination;
};

function num(v: unknown, fallback = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function text(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function nullableText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function parseRow(raw: Record<string, unknown>): AdminInvoiceRegistryRow {
  const kind = String(raw.kind ?? "") as AdminInvoiceRegistryKind;
  return {
    registry_id: text(raw.registry_id),
    entity_id: text(raw.entity_id),
    kind,
    origin: text(raw.origin, "unknown"),
    reference: text(raw.reference),
    customer_name: text(raw.customer_name, "Customer"),
    customer_email: text(raw.customer_email),
    amount_cents: Math.max(0, num(raw.amount_cents)),
    amount_paid_cents: Math.max(0, num(raw.amount_paid_cents)),
    balance_cents: Math.max(0, num(raw.balance_cents)),
    status: text(raw.status, "unknown"),
    is_closed: raw.is_closed === true,
    is_overdue: raw.is_overdue === true,
    created_at: text(raw.created_at),
    due_date: nullableText(raw.due_date),
    view_count: Math.max(0, num(raw.view_count)),
    first_viewed_at: nullableText(raw.first_viewed_at),
    zoho_linked: raw.zoho_linked === true,
    zoho_id: nullableText(raw.zoho_id),
    zoho_number: nullableText(raw.zoho_number),
    zoho_status: nullableText(raw.zoho_status),
    zoho_balance_cents:
      raw.zoho_balance_cents == null ? null : Math.max(0, num(raw.zoho_balance_cents)),
    href: text(raw.href),
    pdf_href: nullableText(raw.pdf_href),
    payment_source: text(raw.payment_source, "Unknown"),
    is_quote: raw.is_quote === true,
    is_invoice: raw.is_invoice === true,
    sync_eligible: raw.sync_eligible === true,
    sync_hold_reason: nullableText(raw.sync_hold_reason),
    period_label: nullableText(raw.period_label),
  };
}

export async function loadAdminInvoiceRegistry(
  admin: SupabaseClient,
  params: {
    kind: AdminInvoiceRegistryKindFilter;
    status: AdminInvoiceRegistryStatusFilter;
    search: string;
    page: number;
    pageSize: number;
  },
): Promise<AdminInvoiceRegistryPayload> {
  const page = Math.max(1, Math.trunc(params.page || 1));
  const pageSize = Math.max(10, Math.min(100, Math.trunc(params.pageSize || 50)));

  const { data, error } = await admin.rpc("admin_invoice_registry_v1", {
    p_kind: params.kind,
    p_status: params.status,
    p_search: params.search.trim(),
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("admin_invoice_registry_v1 returned an invalid payload.");
  }

  const payload = data as {
    rows?: Array<Record<string, unknown>>;
    summary?: Record<string, unknown>;
    pagination?: Record<string, unknown>;
  };

  const s = payload.summary ?? {};
  const p = payload.pagination ?? {};
  const byKindRaw = s.by_kind;
  const byKind =
    byKindRaw && typeof byKindRaw === "object" && !Array.isArray(byKindRaw)
      ? Object.fromEntries(
          Object.entries(byKindRaw as Record<string, unknown>).map(([key, value]) => [
            key,
            Math.max(0, num(value)),
          ]),
        )
      : {};

  return {
    rows: (payload.rows ?? []).map(parseRow),
    summary: {
      total_documents: Math.max(0, num(s.total_documents)),
      invoice_count: Math.max(0, num(s.invoice_count)),
      quote_count: Math.max(0, num(s.quote_count)),
      paid_count: Math.max(0, num(s.paid_count)),
      overdue_count: Math.max(0, num(s.overdue_count)),
      zoho_linked_count: Math.max(0, num(s.zoho_linked_count)),
      missing_zoho_count: Math.max(0, num(s.missing_zoho_count)),
      outstanding_cents: Math.max(0, num(s.outstanding_cents)),
      invoiced_cents: Math.max(0, num(s.invoiced_cents)),
      by_kind: byKind,
    },
    pagination: {
      page: Math.max(1, num(p.page, 1)),
      page_size: Math.max(10, num(p.page_size, pageSize)),
      total_filtered: Math.max(0, num(p.total_filtered)),
      total_pages: Math.max(1, num(p.total_pages, 1)),
      from: Math.max(0, num(p.from)),
      to: Math.max(0, num(p.to)),
      has_next_page: p.has_next_page === true,
      has_previous_page: p.has_previous_page === true,
    },
  };
}
