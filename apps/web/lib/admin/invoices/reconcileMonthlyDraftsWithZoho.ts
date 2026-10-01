import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertInvoiceSyncMetadata } from "@/lib/accounting/syncInvoiceMetadata";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { resolveZohoCustomerContactForMonthlyInvoice } from "@/lib/zoho/resolveZohoCustomerContact";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";
import { getZohoInvoice, lookupZohoCustomerContactId } from "@/lib/zoho/zohoBooksService";
import { formatZohoOrderReference } from "@/lib/zoho/zohoOrderReference";

type ZohoListInvoice = {
  invoice_id: string;
  invoice_number?: string | null;
  reference_number?: string | null;
  status?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  date?: string | null;
  total?: number | null;
  balance?: number | null;
};

type DraftRow = {
  id: string;
  customer_id: string;
  month: string;
  total_amount_cents: number;
  balance_cents: number;
};

export type DraftZohoMatchMethod =
  | "exact_reference"
  | "customer_amount_month"
  | "none"
  | "ambiguous"
  | "conflict";

export type DraftZohoMatchRow = {
  invoice_id: string;
  customer_id: string;
  month: string;
  expected_reference: string;
  amount_cents: number;
  match_method: DraftZohoMatchMethod;
  candidate_count: number;
  candidate_zoho_invoice_id: string | null;
  candidate_zoho_invoice_number: string | null;
  candidate_reference: string | null;
  candidate_customer_name: string | null;
  candidate_total_cents: number | null;
  candidate_status: string | null;
  reason: string | null;
};

export type DraftZohoReconciliationResult = {
  ok: true;
  mode: "dry_run" | "apply";
  total_drafts: number;
  exact_matches: number;
  ambiguous: number;
  unmatched: number;
  conflicts: number;
  linked: number;
  rows: DraftZohoMatchRow[];
};

function cents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

async function listAllZohoInvoices(): Promise<ZohoListInvoice[]> {
  const all: ZohoListInvoice[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<{
      invoices?: ZohoListInvoice[];
      page_context?: { has_more_page?: boolean };
    }>(`/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`);
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}

async function linkedZohoIds(admin: SupabaseClient): Promise<Set<string>> {
  const [bookings, monthly, sales] = await Promise.all([
    admin.from("bookings").select("zoho_invoice_id").not("zoho_invoice_id", "is", null),
    admin.from("monthly_invoices").select("zoho_invoice_id").not("zoho_invoice_id", "is", null),
    admin.from("sales_documents").select("zoho_invoice_id").not("zoho_invoice_id", "is", null),
  ]);
  const ids = new Set<string>();
  for (const row of [
    ...(bookings.data ?? []),
    ...(monthly.data ?? []),
    ...(sales.data ?? []),
  ] as Array<{ zoho_invoice_id?: string | null }>) {
    const id = String(row.zoho_invoice_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function expectedZohoCustomerId(
  admin: SupabaseClient,
  draft: DraftRow,
): Promise<string | null> {
  const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
    invoiceId: draft.id,
    customerId: draft.customer_id,
  });
  if (!contact.ok) return null;
  return lookupZohoCustomerContactId({
    email: contact.contact.email ?? null,
    contactName: contact.contact.name,
  });
}

function candidateToRow(
  draft: DraftRow,
  method: DraftZohoMatchMethod,
  candidates: ZohoListInvoice[],
  reason: string | null,
): DraftZohoMatchRow {
  const candidate = candidates.length === 1 ? candidates[0] : null;
  return {
    invoice_id: draft.id,
    customer_id: draft.customer_id,
    month: draft.month,
    expected_reference: formatZohoOrderReference(draft.id, "monthly"),
    amount_cents: draft.total_amount_cents,
    match_method: method,
    candidate_count: candidates.length,
    candidate_zoho_invoice_id: candidate?.invoice_id ?? null,
    candidate_zoho_invoice_number: candidate?.invoice_number ?? null,
    candidate_reference: candidate?.reference_number ?? null,
    candidate_customer_name: candidate?.customer_name ?? null,
    candidate_total_cents: candidate ? cents(candidate.total) : null,
    candidate_status: candidate?.status ?? null,
    reason,
  };
}

async function buildMatches(
  admin: SupabaseClient,
): Promise<{ drafts: DraftRow[]; rows: DraftZohoMatchRow[] }> {
  const { data: draftRows, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, total_amount_cents, balance_cents")
    .eq("status", "draft")
    .is("zoho_invoice_id", null)
    .order("month", { ascending: false });

  if (error) throw new Error(error.message);

  const drafts = (draftRows ?? []).map((row) => ({
    id: String(row.id),
    customer_id: String(row.customer_id),
    month: String(row.month),
    total_amount_cents: Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))),
    balance_cents: Math.max(0, Math.round(Number(row.balance_cents ?? 0))),
  }));

  const [allZoho, linked] = await Promise.all([listAllZohoInvoices(), linkedZohoIds(admin)]);
  const availableDrafts = allZoho.filter(
    (inv) =>
      norm(inv.status) === "draft" &&
      Boolean(String(inv.invoice_id ?? "").trim()) &&
      !linked.has(String(inv.invoice_id)),
  );

  const rows: DraftZohoMatchRow[] = [];

  for (const draft of drafts) {
    const expectedReference = formatZohoOrderReference(draft.id, "monthly").toLowerCase();
    const byReference = availableDrafts.filter(
      (inv) => norm(inv.reference_number) === expectedReference,
    );

    if (byReference.length > 0) {
      const exactAmount = byReference.filter(
        (inv) => cents(inv.total) === draft.total_amount_cents,
      );
      if (exactAmount.length === 1) {
        rows.push(candidateToRow(draft, "exact_reference", exactAmount, null));
      } else if (exactAmount.length > 1) {
        rows.push(candidateToRow(draft, "ambiguous", exactAmount, "multiple_exact_reference_matches"));
      } else {
        rows.push(candidateToRow(draft, "conflict", byReference, "reference_match_amount_mismatch"));
      }
      continue;
    }

    const zohoCustomerId = await expectedZohoCustomerId(admin, draft);
    if (!zohoCustomerId) {
      rows.push(candidateToRow(draft, "none", [], "customer_not_resolved_in_zoho"));
      continue;
    }

    const byCustomerAmountMonth = availableDrafts.filter((inv) => {
      const invMonth = String(inv.date ?? "").slice(0, 7);
      return (
        String(inv.customer_id ?? "").trim() === zohoCustomerId &&
        cents(inv.total) === draft.total_amount_cents &&
        invMonth === draft.month
      );
    });

    if (byCustomerAmountMonth.length === 1) {
      rows.push(candidateToRow(draft, "customer_amount_month", byCustomerAmountMonth, null));
    } else if (byCustomerAmountMonth.length > 1) {
      rows.push(
        candidateToRow(
          draft,
          "ambiguous",
          byCustomerAmountMonth,
          "multiple_customer_amount_month_matches",
        ),
      );
    } else {
      rows.push(candidateToRow(draft, "none", [], "no_matching_zoho_draft"));
    }
  }

  return { drafts, rows };
}

async function zohoIdStillUnlinked(admin: SupabaseClient, zohoInvoiceId: string): Promise<boolean> {
  const [b, m, s] = await Promise.all([
    admin.from("bookings").select("id").eq("zoho_invoice_id", zohoInvoiceId).limit(1),
    admin.from("monthly_invoices").select("id").eq("zoho_invoice_id", zohoInvoiceId).limit(1),
    admin.from("sales_documents").select("id").eq("zoho_invoice_id", zohoInvoiceId).limit(1),
  ]);
  return !(b.data?.length || m.data?.length || s.data?.length);
}

async function applyOne(
  admin: SupabaseClient,
  row: DraftZohoMatchRow,
): Promise<boolean> {
  if (
    !["exact_reference", "customer_amount_month"].includes(row.match_method) ||
    !row.candidate_zoho_invoice_id
  ) {
    return false;
  }

  const { data: local } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, zoho_invoice_id")
    .eq("id", row.invoice_id)
    .maybeSingle();

  if (
    !local ||
    String(local.status).toLowerCase() !== "draft" ||
    String(local.zoho_invoice_id ?? "").trim() ||
    Math.round(Number(local.total_amount_cents ?? 0)) !== row.amount_cents
  ) {
    return false;
  }

  if (!(await zohoIdStillUnlinked(admin, row.candidate_zoho_invoice_id))) return false;

  const live = await getZohoInvoice(row.candidate_zoho_invoice_id);
  if (!live.ok) return false;
  if (norm(live.status) !== "draft") return false;
  if (Math.round(live.totalCents) !== row.amount_cents) return false;

  if (row.match_method === "exact_reference") {
    const expected = row.expected_reference.toLowerCase();
    if (norm(row.candidate_reference) !== expected) return false;
  }

  const { data: updated, error: updateError } = await admin
    .from("monthly_invoices")
    .update({
      zoho_invoice_id: live.zohoInvoiceId,
      zoho_invoice_number: live.invoiceNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.invoice_id)
    .eq("status", "draft")
    .is("zoho_invoice_id", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) return false;

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "monthly_invoice",
    entityId: row.invoice_id,
    zohoInvoiceId: live.zohoInvoiceId,
    zohoInvoiceNumber: live.invoiceNumber,
    zohoCustomerId: live.customerId,
    invoiceStatus: live.status,
    invoiceTotalCents: live.totalCents,
    taxAmountCents: live.taxCents,
    outstandingBalanceCents: live.balanceCents,
    syncStatus: "synced",
  });

  await admin.from("monthly_invoice_events").insert({
    invoice_id: row.invoice_id,
    kind: "zoho_draft_linked",
    payload: {
      kind: "zoho_draft_linked",
      at: new Date().toISOString(),
      source: "admin_draft_zoho_reconciliation",
      match_method: row.match_method,
      expected_reference: row.expected_reference,
      zoho_invoice_id: live.zohoInvoiceId,
      zoho_invoice_number: live.invoiceNumber,
      total_amount_cents: row.amount_cents,
      customer_email_sent: false,
    },
  });

  await logSystemEvent({
    level: "info",
    source: "accounting/zoho_draft_reconciliation",
    message: "monthly_draft_linked_to_existing_zoho_draft",
    context: {
      invoice_id: row.invoice_id,
      zoho_invoice_id: live.zohoInvoiceId,
      zoho_invoice_number: live.invoiceNumber,
      match_method: row.match_method,
      amount_cents: row.amount_cents,
      customer_email_sent: false,
    },
  });

  return true;
}

export async function reconcileMonthlyDraftsWithZoho(
  admin: SupabaseClient,
  mode: "dry_run" | "apply" = "dry_run",
): Promise<DraftZohoReconciliationResult> {
  const { rows } = await buildMatches(admin);
  let linked = 0;

  if (mode === "apply") {
    for (const row of rows) {
      if (await applyOne(admin, row)) linked += 1;
    }
  }

  return {
    ok: true,
    mode,
    total_drafts: rows.length,
    exact_matches: rows.filter((r) =>
      ["exact_reference", "customer_amount_month"].includes(r.match_method),
    ).length,
    ambiguous: rows.filter((r) => r.match_method === "ambiguous").length,
    unmatched: rows.filter((r) => r.match_method === "none").length,
    conflicts: rows.filter((r) => r.match_method === "conflict").length,
    linked,
    rows,
  };
}
