import type { SupabaseClient } from "@supabase/supabase-js";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type NotificationIdempotencyChannel = "email" | "sms" | "in_app";

/**
 * Insert idempotency claim before sending. Unique (booking_id, event_type, channel) → 23505 = skip duplicate.
 * On non-duplicate insert errors, fail-open (return true) so delivery is not blocked (matches system_logs dedupe).
 */
export async function tryClaimNotificationIdempotency(
  supabase: SupabaseClient,
  params: { bookingId: string; eventType: string; channel: NotificationIdempotencyChannel },
): Promise<boolean> {
  const { error } = await supabase.from("notification_idempotency_claims").insert({
    booking_id: params.bookingId,
    event_type: params.eventType,
    channel: params.channel,
  });
  if (!error) return true;
  if (error.code === "23505") {
    logPaymentStructured("notification_skipped", {
      booking_id: params.bookingId,
      event_type: params.eventType,
      channel: params.channel,
    });
    return false;
  }
  console.error("[NOTIFICATION CLAIM ERROR]", error.message, error.code);
  await reportOperationalIssue("warn", "notificationIdempotencyClaim/insert", error.message, {
    bookingId: params.bookingId,
    eventType: params.eventType,
    channel: params.channel,
    code: error.code,
  });
  return false;
}
