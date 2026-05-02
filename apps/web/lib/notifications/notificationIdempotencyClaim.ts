import type { SupabaseClient } from "@supabase/supabase-js";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type NotificationIdempotencyChannel = "email" | "sms" | "in_app";

export type TryClaimNotificationIdempotencyParams = {
  /** Paystack payment reference — primary dedupe key with eventType + channel. */
  reference: string;
  eventType: string;
  channel: NotificationIdempotencyChannel;
  /** Correlation only; stored when known, not part of uniqueness. */
  bookingId?: string | null;
};

/**
 * Insert idempotency claim before sending. Unique (reference, event_type, channel) → 23505 = skip duplicate.
 * On non-duplicate insert errors, fail-open (return true) so delivery is not blocked (matches system_logs dedupe).
 */
export async function tryClaimNotificationIdempotency(
  supabase: SupabaseClient,
  params: TryClaimNotificationIdempotencyParams,
): Promise<boolean> {
  const reference = String(params.reference ?? "").trim();
  if (!reference) {
    console.warn("[IDEMPOTENCY KEY] missing reference — claim skipped", {
      eventType: params.eventType,
      channel: params.channel,
      bookingId: params.bookingId ?? null,
    });
    return true;
  }

  console.log("[IDEMPOTENCY KEY]", {
    reference,
    eventType: params.eventType,
    channel: params.channel,
  });

  const bookingId = params.bookingId?.trim() || null;
  const { error } = await supabase.from("notification_idempotency_claims").insert({
    reference,
    event_type: params.eventType,
    channel: params.channel,
    ...(bookingId ? { booking_id: bookingId } : {}),
  });
  if (!error) return true;
  if (error.code === "23505") {
    logPaymentStructured("notification_skipped", {
      paystack_reference: reference,
      booking_id: bookingId,
      event_type: params.eventType,
      channel: params.channel,
    });
    return false;
  }
  console.error("[NOTIFICATION CLAIM ERROR]", error.message, error.code);
  await reportOperationalIssue("warn", "notificationIdempotencyClaim/insert", error.message, {
    reference,
    bookingId,
    eventType: params.eventType,
    channel: params.channel,
    code: error.code,
  });
  return false;
}
