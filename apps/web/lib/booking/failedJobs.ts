import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BookingInsertFailedPayload = {
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: unknown;
  paystackMetadata?: Record<string, string | undefined> | null;
};

/** Queue work for the retry worker (cron). Fails silently if Supabase is unavailable. */
export async function enqueueFailedJob(type: string, payload: unknown): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("warn", "enqueueFailedJob", "Supabase not configured; failed_jobs queue skipped", {
      type,
    });
    return;
  }
  const { error } = await supabase.from("failed_jobs").insert({ type, payload });
  if (error) {
    await reportOperationalIssue("error", "enqueueFailedJob", error.message, { type });
  }
}
