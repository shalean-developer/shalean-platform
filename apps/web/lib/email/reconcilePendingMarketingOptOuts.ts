import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileResendUnsubscribe } from "@/lib/email/reconcileResendUnsubscribe";

/** Processes a bounded batch of unsubscribe-only reconciliation jobs. Never subscribes anyone. */
export async function reconcilePendingMarketingOptOuts(
  admin: SupabaseClient, apiKey: string,
): Promise<{ attempted: number; completed: number; deferred: number }> {
  const { data: due, error } = await admin.from("marketing_email_reconciliation_jobs")
    .select("id, email, attempt_count").eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at")
    .limit(20);
  if (error) throw new Error("Cannot load marketing reconciliation queue.");
  let completed = 0;
  let deferred = 0;
  for (const job of due ?? []) {
    const outcome = await reconcileResendUnsubscribe(job.email, { apiKey });
    const now = new Date().toISOString();
    const attempts = Number(job.attempt_count ?? 0) + 1;
    if (outcome === "updated" || outcome === "not_found") {
      const { error: updateError } = await admin.from("marketing_email_reconciliation_jobs")
        .update({ status: "completed", attempt_count: attempts,
          last_error: null, updated_at: now })
        .eq("id", job.id).eq("status", "pending");
      if (updateError) throw new Error("Could not persist provider reconciliation result.");
      completed++;
      continue;
    }
    const delayMinutes = Math.min(24 * 60, 5 * Math.pow(2, Math.min(attempts, 8)));
    const { error: updateError } = await admin.from("marketing_email_reconciliation_jobs")
      .update({ attempt_count: attempts, last_error: "provider_retry_required",
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        updated_at: now })
      .eq("id", job.id).eq("status", "pending");
    if (updateError) throw new Error("Could not persist provider reconciliation retry.");
    deferred++;
  }
  return { attempted: (due ?? []).length, completed, deferred };
}
