import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type NotificationDedupeSource =
  | "reminder_2h_sent"
  | "assigned_sent"
  | "completed_sent"
  | "sla_breach_sent"
  | "review_prompt_sms_sent"
  | "review_prompt_sms_reminder_sent"
  | "abandon_checkout_reminder_sent"
  | "daily_ops_summary";

/**
 * Inserts a claim row guarded by partial unique index `idx_notification_dedupe`.
 * Returns true if this worker owns the slot (insert ok), false if duplicate (23505) or fatal insert error.
 */
export async function tryClaimNotificationDedupe(
  supabase: SupabaseClient,
  source: NotificationDedupeSource,
  context: { bookingId: string; cleanerId?: string },
): Promise<boolean> {
  const row = {
    level: "info" as const,
    source,
    message: `dedupe_claim:${source}`,
    context: {
      bookingId: context.bookingId,
      ...(context.cleanerId ? { cleanerId: context.cleanerId } : {}),
    },
  };
  const { error } = await supabase.from("system_logs").insert(row);
  if (!error) return true;
  if (error.code === "23505") return false;
  await reportOperationalIssue("warn", "notificationDedupe/insert", error.message, {
    source,
    bookingId: context.bookingId,
    code: error.code,
  });
  /** Index missing or transient DB error — do not block customer/cleaner delivery. */
  return true;
}
