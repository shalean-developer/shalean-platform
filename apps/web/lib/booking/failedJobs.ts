import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
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

export type PaymentMismatchFailedPayload = {
  paystackReference: string;
  bookingId: string | null;
  amountCents: number;
  currency: string;
};

/**
 * Queue work for the retry worker (cron). Never throws: returns false when the row cannot be persisted
 * and writes a durable `system_logs` row for ops recovery.
 */
export async function enqueueFailedJob(type: string, payload: unknown): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      await reportOperationalIssue("critical", "enqueueFailedJob", "Supabase admin client missing; failed_jobs enqueue aborted", {
        type,
      });
      await logSystemEvent({
        level: "error",
        source: "enqueueFailedJob/fallback",
        message: "[CRITICAL_PAYMENT_FAILURE] failed_jobs enqueue aborted (no admin client)",
        context: { type, payload },
      });
      console.error("[FAILED JOB INSERT ERROR]", { type, err: "no_supabase_admin" });
      return false;
    }
    const { error } = await supabase.from("failed_jobs").insert({ type, payload });
    if (error) {
      await reportOperationalIssue("critical", "enqueueFailedJob", `failed_jobs insert failed: ${error.message}`, {
        type,
        code: error.code,
      });
      await logSystemEvent({
        level: "error",
        source: "enqueueFailedJob/fallback",
        message: "[CRITICAL_PAYMENT_FAILURE] failed_jobs insert failed",
        context: { type, code: error.code, payload },
      });
      console.error("[FAILED JOB INSERT ERROR]", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[FAILED JOB INSERT ERROR]", err);
    await reportOperationalIssue("critical", "enqueueFailedJob", `enqueueFailedJob threw: ${err instanceof Error ? err.message : String(err)}`, {
      type,
    });
    try {
      await logSystemEvent({
        level: "error",
        source: "enqueueFailedJob/fallback",
        message: "[CRITICAL_PAYMENT_FAILURE] enqueueFailedJob unexpected error",
        context: { type, payload, err: err instanceof Error ? err.message : String(err) },
      });
    } catch (logErr) {
      console.error("[CRITICAL] SYSTEM LOG FAILED", logErr);
    }
    return false;
  }
}
