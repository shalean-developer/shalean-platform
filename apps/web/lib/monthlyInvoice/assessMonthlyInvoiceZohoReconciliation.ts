import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertInvoiceSyncMetadata } from "@/lib/accounting/syncInvoiceMetadata";
import { getZohoInvoice } from "@/lib/zoho/zohoBooksService";

export type MonthlyInvoiceZohoReconciliation =
  | {
      ok: true;
      linked: false;
      reconciliationRequired: false;
      code: "not_linked";
    }
  | {
      ok: true;
      linked: true;
      reconciliationRequired: boolean;
      code:
        | "aligned"
        | "local_draft_zoho_non_draft"
        | "payment_state_mismatch"
        | "total_mismatch";
      localStatus: string;
      localTotalCents: number;
      localBalanceCents: number;
      zohoStatus: string;
      zohoTotalCents: number;
      zohoBalanceCents: number;
      zohoInvoiceId: string;
      zohoInvoiceNumber: string;
    }
  | { ok: false; error: string };

export async function assessMonthlyInvoiceZohoReconciliation(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<MonthlyInvoiceZohoReconciliation> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, balance_cents, zoho_invoice_id, zoho_invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "invoice_not_found" };

  const row = data as {
    status?: string | null;
    total_amount_cents?: number | null;
    balance_cents?: number | null;
    zoho_invoice_id?: string | null;
    zoho_invoice_number?: string | null;
  };

  const zohoInvoiceId = String(row.zoho_invoice_id ?? "").trim();
  if (!zohoInvoiceId) {
    return { ok: true, linked: false, reconciliationRequired: false, code: "not_linked" };
  }

  const zoho = await getZohoInvoice(zohoInvoiceId);
  if (!zoho.ok) return { ok: false, error: `zoho_lookup_failed:${zoho.error}` };

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "monthly_invoice",
    entityId: invoiceId,
    zohoInvoiceId: zoho.zohoInvoiceId,
    zohoInvoiceNumber: zoho.invoiceNumber,
    zohoCustomerId: zoho.customerId,
    invoiceStatus: zoho.status,
    invoiceTotalCents: zoho.totalCents,
    taxAmountCents: zoho.taxCents,
    outstandingBalanceCents: zoho.balanceCents,
    syncStatus: "synced",
    syncErrors: null,
  });

  const localStatus = String(row.status ?? "").toLowerCase();
  const localTotalCents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const localBalanceCents = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
  const zohoStatus = String(zoho.status ?? "").toLowerCase();
  const zohoSettled = zohoStatus === "paid" || zoho.balanceCents <= 0;
  const localSettled = localStatus === "paid" || localStatus === "refunded" || localBalanceCents <= 0;

  let code: "aligned" | "local_draft_zoho_non_draft" | "payment_state_mismatch" | "total_mismatch" = "aligned";
  let reconciliationRequired = false;

  if (localStatus === "draft" && zohoStatus !== "draft") {
    code = "local_draft_zoho_non_draft";
    reconciliationRequired = true;
  } else if (localSettled !== zohoSettled) {
    code = "payment_state_mismatch";
    reconciliationRequired = true;
  } else if (localTotalCents !== zoho.totalCents) {
    code = "total_mismatch";
    reconciliationRequired = localStatus !== "draft";
  }

  return {
    ok: true,
    linked: true,
    reconciliationRequired,
    code,
    localStatus,
    localTotalCents,
    localBalanceCents,
    zohoStatus,
    zohoTotalCents: zoho.totalCents,
    zohoBalanceCents: zoho.balanceCents,
    zohoInvoiceId: zoho.zohoInvoiceId,
    zohoInvoiceNumber: zoho.invoiceNumber,
  };
}
