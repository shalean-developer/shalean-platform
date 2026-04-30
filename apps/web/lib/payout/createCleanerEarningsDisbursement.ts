import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCleanerApprovedEarningsPaystack } from "@/lib/payout/executeCleanerApprovedEarningsPaystack";

/**
 * Claims approved `cleaner_earnings`, sends one Paystack transfer, and relies on webhooks to mark rows `paid`.
 */
export async function createCleanerEarningsDisbursement(
  admin: SupabaseClient,
  cleanerId: string,
  opts?: { initiatedBy?: string | null },
): Promise<
  | { ok: true; disbursement_id: string; transfer_code: string | null; reference: string; skipped?: boolean }
  | { ok: false; error: string; code?: string; status?: number }
> {
  const cid = cleanerId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return { ok: false, error: "Invalid cleaner id", status: 400 };

  const r = await executeCleanerApprovedEarningsPaystack(admin, { cleanerId: cid, initiatedBy: opts?.initiatedBy ?? null });
  if (!r.ok) {
    return {
      ok: false,
      error: r.error,
      code: r.code,
      status: r.status,
    };
  }
  return {
    ok: true,
    disbursement_id: r.disbursement_id,
    transfer_code: r.transferCode,
    reference: r.reference,
    skipped: r.skipped === true,
  };
}
