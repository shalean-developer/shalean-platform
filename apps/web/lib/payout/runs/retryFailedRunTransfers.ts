import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { payCleanerPayoutWithPaystack } from "@/lib/payout/paystackPayout";

export type RetryFailedRunTransfersResult = {
  runId: string;
  attempted: number;
  succeeded: number;
  errors: string[];
};

/**
 * Re-sends Paystack for approved payouts in a run whose execution failed (or never left pending after failure).
 * Does not target rows already `payment_status=processing` (wait for webhook / reconcile cron).
 */
export async function retryFailedRunTransfers(
  admin: SupabaseClient,
  params: { runId: string; paidBy: string; payoutId?: string | null },
): Promise<RetryFailedRunTransfersResult> {
  const { runId, paidBy, payoutId } = params;
  let q = admin
    .from("cleaner_payouts")
    .select("id, payment_status")
    .eq("payout_run_id", runId)
    .eq("status", "approved")
    .in("payment_status", ["failed", "partial_failed"]);

  if (payoutId?.trim()) q = q.eq("id", payoutId.trim());

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const list = (rows ?? []) as { id: string; payment_status?: string | null }[];
  const targets = list.filter((r) => String(r.payment_status ?? "").toLowerCase() !== "processing");

  const errors: string[] = [];
  let succeeded = 0;

  for (const row of targets) {
    const id = row.id;
    const res = await payCleanerPayoutWithPaystack(admin, { payoutId: id, paidBy });
    if (res.ok) succeeded += 1;
    else errors.push(`${id}: ${res.error}`);
  }

  void logSystemEvent({
    level: "info",
    source: "retryFailedRunTransfers",
    message: "Payout run retry batch",
    context: {
      runId,
      payoutId: payoutId ?? null,
      attempted: targets.length,
      succeeded,
      failed: errors.length,
    },
  });

  return { runId, attempted: targets.length, succeeded, errors };
}
