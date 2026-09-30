import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { SALES_DOCUMENT_ADMIN_COLUMNS } from "@/lib/salesDocument/salesDocumentColumns";
import { assessMonthlyInvoiceFinalizeReadiness } from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { resolveMonthlyInvoiceCustomerEmail } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

export type AdminBillingDocumentKind =
  | "quote"
  | "sales_invoice"
  | "booking_invoice"
  | "monthly_invoice";

export type AdminBillingDocumentRow = {
  id: string;
  kind: AdminBillingDocumentKind;
  label: string;
  customer_name: string;
  customer_email: string;
  amount_cents: number;
  amount_paid_cents?: number;
  status: string;
  zoho_linked: boolean;
  zoho_id: string | null;
  created_at: string;
  href: string;
  source?: string | null;
  sync_eligible: boolean;
  sync_hold_reason?: string | null;
};

export type AdminBillingDocumentsSummary = {
  total: number;
  zoho_linked: number;
  missing_zoho: number;
  by_kind: Record<AdminBillingDocumentKind, { total: number; missing_zoho: number }>;
};

export type AdminBillingDocumentsPayload = {
  documents: AdminBillingDocumentRow[];
  summary: AdminBillingDocumentsSummary;
  pagination: {
    page: number;
    page_size: number;
    total_filtered: number;
    total_pages: number;
  };
};

function zohoLinkedForSalesDoc(row: Record<string, unknown>): { linked: boolean; id: string | null } {
  const documentType = String(row.document_type ?? "");
  if (documentType === "quote") {
    const id = String(row.zoho_estimate_id ?? "").trim();
    return { linked: Boolean(id), id: id || null };
  }
  const id = String(row.zoho_invoice_id ?? "").trim();
  return { linked: Boolean(id), id: id || null };
}

function bookingNeedsZoho(row: Record<string, unknown>): boolean {
  if (row.is_test === true) return false;
  if (String(row.status ?? "").trim().toLowerCase() === "cancelled") return false;
  if (row.is_monthly_billing_booking === true) return false;
  if (String(row.sales_document_id ?? "").trim()) return false;
  if (String(row.payment_method ?? "").toLowerCase() === "zoho") return false;
  if (String(row.zoho_invoice_id ?? "").trim()) return false;
  return true;
}

export function billingDocumentNeedsZohoSync(doc: Pick<AdminBillingDocumentRow, "zoho_linked" | "amount_cents" | "status" | "sync_eligible">): boolean {
  return !doc.zoho_linked && doc.amount_cents > 0 && doc.status !== "requested" && doc.sync_eligible;
}

async function monthlyInvoiceSyncEligibility(
  admin: SupabaseClient,
  row: {
    id: string;
    customer_id: string;
    month: string;
    status: string;
    total_amount_cents: number;
    zoho_invoice_id?: string | null;
  },
): Promise<{ eligible: boolean; reason: string | null }> {
  if (String(row.zoho_invoice_id ?? "").trim()) return { eligible: false, reason: null };
  if (Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))) <= 0) {
    return { eligible: false, reason: "No billable amount" };
  }

  const status = String(row.status ?? "").toLowerCase();
  if (status !== "draft") return { eligible: true, reason: null };

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select("status")
    .eq("monthly_invoice_id", row.id);
  if (bookingsError) return { eligible: false, reason: "Could not verify booking readiness" };

  const open = (bookings ?? []).filter((b) => {
    const s = String((b as { status?: string | null }).status ?? "").toLowerCase();
    return s !== "completed" && s !== "cancelled";
  }).length;
  if (open > 0) return { eligible: false, reason: "Open booking" };

  const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
    invoiceId: row.id,
    customerId: row.customer_id,
    month: row.month,
    todayYmd: todayJohannesburg(),
  });
  if (!readiness.ready) {
    return {
      eligible: false,
      reason: readiness.reason === "recurring_schedule_incomplete" ? "Schedule incomplete" : "Not ready",
    };
  }

  const outboundEmail = await resolveMonthlyInvoiceCustomerEmail(admin, {
    customerId: row.customer_id,
    invoiceId: row.id,
  });
  if (!outboundEmail) return { eligible: false, reason: "Contact required" };

  return { eligible: true, reason: null };
}

async function fetchAllPages(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 500,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await fetchPage(from, to);
    if (res.error) throw new Error(res.error.message);
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function loadAdminBillingDocuments(
  admin: SupabaseClient,
  opts?: {
    q?: string;
    kind?: AdminBillingDocumentKind | "all" | "missing_zoho";
    page?: number;
    pageSize?: number;
  },
): Promise<AdminBillingDocumentsPayload> {
  const q = (opts?.q ?? "").trim().toLowerCase();
  const kindFilter = opts?.kind ?? "all";
  const page = Math.max(1, Math.trunc(opts?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(opts?.pageSize ?? 50)));

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const salesRows = (await fetchAllPages(async (from, to) => {
    const res = await admin
      .from("sales_documents")
      .select(SALES_DOCUMENT_ADMIN_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, to);
    return { data: (res.data ?? []) as unknown[], error: res.error };
  })) as Record<string, unknown>[];

  const bookingSelect = [
    "id",
    ownershipColumn,
    "customer_name",
    "customer_email",
    "service",
    "date",
    "total_paid_zar",
    "amount_paid_cents",
    "payment_status",
    "payment_method",
    "status",
    "is_test",
    "payment_completed_at",
    "is_monthly_billing_booking",
    "sales_document_id",
    "zoho_invoice_id",
    "created_at",
  ].join(", ");

  const [bookingRows, monthlyRows] = await Promise.all([
    fetchAllPages(async (from, to) => {
      const res = await admin
        .from("bookings")
        .select(bookingSelect)
        .not("payment_completed_at", "is", null)
        .order("payment_completed_at", { ascending: false })
        .range(from, to);
      return { data: (res.data ?? []) as unknown[], error: res.error };
    }),
    fetchAllPages(async (from, to) => {
      const res = await admin
        .from("monthly_invoices")
        .select("id, customer_id, month, status, total_amount_cents, zoho_invoice_id, created_at")
        .order("created_at", { ascending: false })
        .range(from, to);
      return { data: (res.data ?? []) as unknown[], error: res.error };
    }),
  ]);

  const typedBookingRows = bookingRows as Record<string, unknown>[];
  const typedMonthlyRows = monthlyRows as Record<string, unknown>[];

  const customerIds = new Set<string>();
  for (const row of typedMonthlyRows) {
    const cid = String((row as { customer_id?: string }).customer_id ?? "").trim();
    if (cid) customerIds.add(cid);
  }

  const profileNames = new Map<string, { name: string; email: string }>();
  if (customerIds.size > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name, billing_email")
      .in("id", [...customerIds]);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null; billing_email?: string | null };
      profileNames.set(row.id, {
        name: String(row.full_name ?? "").trim() || "Customer",
        email: String(row.billing_email ?? "").trim(),
      });
    }
  }

  const documents: AdminBillingDocumentRow[] = [];

  for (const raw of salesRows) {
    const row = raw as Record<string, unknown>;
    const documentType = String(row.document_type ?? "");
    const kind: AdminBillingDocumentKind = documentType === "quote" ? "quote" : "sales_invoice";
    const zoho = zohoLinkedForSalesDoc(row);
    documents.push({
      id: String(row.id),
      kind,
      label: kind === "quote" ? "Quote" : "Sales invoice",
      customer_name: String(row.customer_name ?? ""),
      customer_email: String(row.customer_email ?? ""),
      amount_cents: Math.max(0, Math.round(Number(row.total_cents ?? 0))),
      amount_paid_cents: Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0))),
      status: String(row.status ?? ""),
      zoho_linked: zoho.linked,
      zoho_id: zoho.id,
      created_at: String(row.created_at ?? ""),
      href: `/office/sales-documents/${String(row.id)}`,
      source: typeof row.source === "string" ? row.source : null,
      sync_eligible: !zoho.linked && Math.max(0, Math.round(Number(row.total_cents ?? 0))) > 0 && String(row.status ?? "") !== "requested",
      sync_hold_reason: null,
    });
  }

  for (const raw of typedBookingRows) {
    const row = raw as unknown as Record<string, unknown>;
    const zohoId = String(row.zoho_invoice_id ?? "").trim();
    const include = zohoId || bookingNeedsZoho(row);
    if (!include) continue;
    const totalZar =
      typeof row.total_paid_zar === "number"
        ? row.total_paid_zar
        : Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0))) / 100;
    documents.push({
      id: String(row.id),
      kind: "booking_invoice",
      label: String(row.service ?? "Booking"),
      customer_name: String(row.customer_name ?? ""),
      customer_email: String(row.customer_email ?? ""),
      amount_cents: Math.max(0, Math.round(totalZar * 100)),
      status: String(row.payment_status ?? "paid"),
      zoho_linked: Boolean(zohoId),
      zoho_id: zohoId || null,
      created_at: String(row.payment_completed_at ?? row.created_at ?? ""),
      href: `/office/bookings/${String(row.id)}`,
      sync_eligible: bookingNeedsZoho(row),
      sync_hold_reason:
        String(row.status ?? "").trim().toLowerCase() === "cancelled" ? "Cancelled" : null,
    });
  }

  for (const raw of typedMonthlyRows) {
    const row = raw as {
      id: string;
      customer_id?: string;
      month?: string;
      status?: string;
      total_amount_cents?: number;
      zoho_invoice_id?: string | null;
      created_at?: string;
    };
    const profile = row.customer_id ? profileNames.get(row.customer_id) : undefined;
    const zohoId = String(row.zoho_invoice_id ?? "").trim();
    const syncEligibility = await monthlyInvoiceSyncEligibility(admin, {
      id: row.id,
      customer_id: String(row.customer_id ?? ""),
      month: String(row.month ?? ""),
      status: String(row.status ?? ""),
      total_amount_cents: Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))),
      zoho_invoice_id: row.zoho_invoice_id,
    });
    documents.push({
      id: row.id,
      kind: "monthly_invoice",
      label: `Monthly ${String(row.month ?? "").slice(0, 7)}`,
      customer_name: profile?.name ?? "Customer",
      customer_email: profile?.email ?? "",
      amount_cents: Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))),
      status: String(row.status ?? ""),
      zoho_linked: Boolean(zohoId),
      zoho_id: zohoId || null,
      created_at: String(row.created_at ?? ""),
      href: `/office/invoices/${row.id}`,
      sync_eligible: syncEligibility.eligible,
      sync_hold_reason: syncEligibility.reason,
    });
  }

  documents.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  let filtered = documents;
  if (kindFilter !== "all" && kindFilter !== "missing_zoho") {
    filtered = filtered.filter((d) => d.kind === kindFilter);
  }
  if (kindFilter === "missing_zoho") {
    filtered = filtered.filter((d) => billingDocumentNeedsZohoSync(d));
  }
  if (q) {
    filtered = filtered.filter((d) => {
      const hay = `${d.id} ${d.customer_name} ${d.customer_email} ${d.label} ${d.kind}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const summary: AdminBillingDocumentsSummary = {
    total: documents.length,
    zoho_linked: documents.filter((d) => d.zoho_linked).length,
    missing_zoho: documents.filter((d) => billingDocumentNeedsZohoSync(d)).length,
    by_kind: {
      quote: { total: 0, missing_zoho: 0 },
      sales_invoice: { total: 0, missing_zoho: 0 },
      booking_invoice: { total: 0, missing_zoho: 0 },
      monthly_invoice: { total: 0, missing_zoho: 0 },
    },
  };

  for (const d of documents) {
    summary.by_kind[d.kind].total += 1;
    if (billingDocumentNeedsZohoSync(d)) {
      summary.by_kind[d.kind].missing_zoho += 1;
    }
  }

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    documents: filtered.slice(start, start + pageSize),
    summary,
    pagination: {
      page: safePage,
      page_size: pageSize,
      total_filtered: totalFiltered,
      total_pages: totalPages,
    },
  };
}
