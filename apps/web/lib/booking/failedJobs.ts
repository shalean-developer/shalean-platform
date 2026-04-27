import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const FAILED_JOBS_ENQUEUE_ERROR = "FAILED_JOBS_ENQUEUE_FAILED";

export type BookingInsertFailedPayload = {
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: unknown;
  paystackMetadata?: Record<string, string | undefined> | null;
};

/**
 * Queue work for the retry worker (cron). Throws if the row cannot be persisted — callers must not
 * acknowledge payment to Paystack until enqueue succeeds.
 */
export async function enqueueFailedJob(type: string, payload: unknown): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("critical", "enqueueFailedJob", "Supabase admin client missing; failed_jobs enqueue aborted", {
      type,
    });
    throw new Error(FAILED_JOBS_ENQUEUE_ERROR);
  }
  const { error } = await supabase.from("failed_jobs").insert({ type, payload });
  if (error) {
    await reportOperationalIssue("critical", "enqueueFailedJob", `failed_jobs insert failed: ${error.message}`, {
      type,
      code: error.code,
    });
    throw new Error(FAILED_JOBS_ENQUEUE_ERROR);
  }
}
