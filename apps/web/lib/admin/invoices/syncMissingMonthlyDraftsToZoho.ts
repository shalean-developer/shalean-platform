import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { syncDraftMonthlyInvoiceToZohoAfterRecompute } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";

export type MissingDraftZohoSyncRow = {
  invoice_id: string;
  customer_id: string;
  month: string;
  total_amount_cents: number;
  due_date: string | null;
};

export type MissingDraftZohoSyncResult = {
  ok: true;
  mode: "dry_run" | "apply";
  eligible: number;
  synced: number;
  failed: number;
  skipped: number;
  rows: Array<
    MissingDraftZohoSyncRow & {
      result: "eligible" | "synced" | "failed" | "skipped";
      zoho_invoice_id?: string | null;
      zoho_invoice_number?: string | null;
      error?: string | null;
    }
  >;
};

async function loadEligibleDrafts(admin: SupabaseClient): Promise<MissingDraftZohoSyncRow[]> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, total_amount_cents, due_date, status, zoho_invoice_id")
    .eq("status", "draft")
    .is("zoho_invoice_id", null)
    .gt("total_amount_cents", 0)
    .order("month", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    invoice_id: String(row.id),
    customer_id: String(row.customer_id),
    month: String(row.month),
    total_amount_cents: Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))),
    due_date: row.due_date ? String(row.due_date) : null,
  }));
}

export async function syncMissingMonthlyDraftsToZoho(
  admin: SupabaseClient,
  mode: "dry_run" | "apply" = "dry_run",
): Promise<MissingDraftZohoSyncResult> {
  const drafts = await loadEligibleDrafts(admin);

  if (mode === "dry_run") {
    return {
      ok: true,
      mode,
      eligible: drafts.length,
      synced: 0,
      failed: 0,
      skipped: 0,
      rows: drafts.map((row) => ({ ...row, result: "eligible" as const })),
    };
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const rows: MissingDraftZohoSyncResult["rows"] = [];

  for (const draft of drafts) {
    try {
      const { data: before } = await admin
        .from("monthly_invoices")
        .select("id, status, total_amount_cents, zoho_invoice_id")
        .eq("id", draft.invoice_id)
        .maybeSingle();

      if (
        !before ||
        String(before.status ?? "").toLowerCase() !== "draft" ||
        String(before.zoho_invoice_id ?? "").trim() ||
        Math.round(Number(before.total_amount_cents ?? 0)) !== draft.total_amount_cents
      ) {
        skipped += 1;
        rows.push({ ...draft, result: "skipped", error: "invoice_changed_before_sync" });
        continue;
      }

      await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, draft.invoice_id);

      const { data: after, error: afterError } = await admin
        .from("monthly_invoices")
        .select("zoho_invoice_id, zoho_invoice_number, status, total_amount_cents")
        .eq("id", draft.invoice_id)
        .maybeSingle();

      if (afterError) throw new Error(afterError.message);

      const zohoInvoiceId = String(after?.zoho_invoice_id ?? "").trim();
      const zohoInvoiceNumber = String(after?.zoho_invoice_number ?? "").trim();

      if (!zohoInvoiceId) {
        failed += 1;
        rows.push({
          ...draft,
          result: "failed",
          zoho_invoice_id: null,
          zoho_invoice_number: null,
          error: "zoho_sync_did_not_link_invoice",
        });
        continue;
      }

      synced += 1;
      rows.push({
        ...draft,
        result: "synced",
        zoho_invoice_id: zohoInvoiceId,
        zoho_invoice_number: zohoInvoiceNumber || null,
        error: null,
      });

      await logSystemEvent({
        level: "info",
        source: "accounting/monthly_draft_zoho_sync",
        message: "monthly_draft_created_or_linked_in_zoho",
        context: {
          invoice_id: draft.invoice_id,
          zoho_invoice_id: zohoInvoiceId,
          zoho_invoice_number: zohoInvoiceNumber || null,
          total_amount_cents: draft.total_amount_cents,
          customer_email_sent: false,
          finalized: false,
          marked_paid: false,
        },
      });
    } catch (error) {
      failed += 1;
      rows.push({
        ...draft,
        result: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    mode,
    eligible: drafts.length,
    synced,
    failed,
    skipped,
    rows,
  };
}
