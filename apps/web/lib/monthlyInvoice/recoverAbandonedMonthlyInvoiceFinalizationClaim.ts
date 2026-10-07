import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecoverAbandonedMonthlyInvoiceFinalizationClaimResult =
  | { ok: true; recovered: boolean }
  | { ok: false; error: string };

/**
 * Explicit operator-only recovery for an abandoned monthly-invoice finalization claim.
 *
 * This helper is intentionally not called by normal cron/admin finalization. It reads the
 * currently stored token and asks the DB recovery RPC to clear it only when the claim is
 * stale and no finalization side effect has started.
 */
export async function recoverAbandonedMonthlyInvoiceFinalizationClaim(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<RecoverAbandonedMonthlyInvoiceFinalizationClaimResult> {
  const id = invoiceId.trim();
  if (!id) return { ok: false, error: "missing_invoice_id" };

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("finalization_claim_token")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const token =
    data?.finalization_claim_token != null
      ? String(data.finalization_claim_token).trim()
      : "";

  if (!token) return { ok: true, recovered: false };

  const { data: recovered, error: recoverErr } = await admin.rpc(
    "recover_abandoned_monthly_invoice_finalization_claim",
    {
      p_invoice_id: id,
      p_expected_token: token,
    },
  );

  if (recoverErr) return { ok: false, error: recoverErr.message };
  return { ok: true, recovered: recovered === true };
}
