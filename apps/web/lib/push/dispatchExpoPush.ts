import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideNotificationRetry,
  maskNotificationRecipient,
} from "@/lib/notifications/retryContract";
import {
  releaseNotificationIdempotencyClaim,
  tryClaimNotificationIdempotency,
} from "@/lib/notifications/notificationIdempotencyClaim";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { deleteUserPushToken } from "@/lib/customer/customerPushTokens";
import { classifyExpoPushFailure } from "@/lib/push/classifyExpoPushError";
import { getExpoPushAdapter } from "@/lib/push/expoPushAdapter";
import { sanitizePushData, sanitizePushTitleBody } from "@/lib/push/sanitizePushPayload";
import type {
  ExpoPushAdapter,
  PushDispatchInput,
  PushDispatchOutcome,
} from "@/lib/push/expoPushTypes";

export type DispatchExpoPushDeps = {
  admin: SupabaseClient;
  adapter?: ExpoPushAdapter;
  nowMs?: number;
  random?: () => number;
};

function buildRetryPayload(
  input: PushDispatchInput,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const { title, body } = sanitizePushTitleBody(input.title, input.body);
  return {
    title,
    body,
    data: sanitizePushData(input.data),
    app: input.app ?? "customer",
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    recipient_masked: maskNotificationRecipient(input.token),
    ...extra,
  };
}

/**
 * Send one Expo push with idempotency, retry scheduling metadata, and invalid-token cleanup.
 * Never throws. Writes `notification_logs` (requires push/expo migration on DB).
 */
export async function dispatchExpoPush(
  deps: DispatchExpoPushDeps,
  input: PushDispatchInput,
): Promise<PushDispatchOutcome> {
  const adapter = deps.adapter ?? getExpoPushAdapter();
  const prior = Math.max(0, Math.floor(input.priorAttempts ?? 0));
  const { title, body } = sanitizePushTitleBody(input.title, input.body);
  const data = sanitizePushData(input.data);

  const claimed = await tryClaimNotificationIdempotency(deps.admin, {
    reference: input.idempotencyKey,
    eventType: input.eventType,
    channel: "push",
    bookingId: input.bookingId ?? null,
  });
  if (!claimed) {
    return { status: "skipped_duplicate" };
  }

  const result = await adapter.send([
    {
      to: input.token.trim(),
      title,
      body,
      data,
      sound: "default",
      priority: "high",
    },
  ]);

  const ticket = result.tickets?.[0] ?? null;

  if (result.ok && ticket?.status === "ok") {
    await writeNotificationLog({
      booking_id: input.bookingId ?? null,
      channel: "push",
      template_key: input.templateKey,
      recipient: input.token,
      status: "sent",
      error: null,
      provider: "expo",
      role: input.role,
      event_type: input.eventType,
      payload: buildRetryPayload(input, {
        ticket_id: ticket.id ?? null,
        attempts: prior + 1,
        terminal: false,
        error_category: "success",
        decision: "sent",
      }),
    });
    return { status: "sent", ticketId: ticket.id, attempt: prior + 1 };
  }

  const classified = classifyExpoPushFailure({
    httpStatus: result.ok ? null : result.httpStatus,
    ticket: ticket?.status === "error" ? ticket : null,
    transportError: result.ok ? ticket?.message ?? null : result.error,
  });

  const errorText = result.ok
    ? ticket?.message ?? classified.category
    : result.error;

  if (classified.category === "device_not_registered") {
    await deleteUserPushToken(deps.admin, input.userId, input.token);
    await writeNotificationLog({
      booking_id: input.bookingId ?? null,
      channel: "push",
      template_key: input.templateKey,
      recipient: input.token,
      status: "failed",
      error: errorText,
      provider: "expo",
      role: input.role,
      event_type: input.eventType,
      payload: buildRetryPayload(input, {
        attempts: prior + 1,
        terminal: true,
        error_category: classified.category,
        failure_class: classified.failureClass,
        decision: "dead_letter",
        token_removed: true,
        next_retry_at: null,
      }),
    });
    return {
      status: "dead_letter",
      attempt: prior + 1,
      errorCategory: classified.category,
      error: errorText,
      tokenRemoved: true,
    };
  }

  const decision = decideNotificationRetry({
    priorAttempts: prior,
    failureClass: classified.failureClass,
    nowMs: deps.nowMs,
    random: deps.random,
  });

  if (decision.action === "retry") {
    // Release claim so a later worker / operator retry can re-send.
    await releaseNotificationIdempotencyClaim(deps.admin, {
      reference: input.idempotencyKey,
      eventType: input.eventType,
      channel: "push",
      bookingId: input.bookingId ?? null,
    });
    await writeNotificationLog({
      booking_id: input.bookingId ?? null,
      channel: "push",
      template_key: input.templateKey,
      recipient: input.token,
      status: "failed",
      error: errorText,
      provider: "expo",
      role: input.role,
      event_type: input.eventType,
      payload: buildRetryPayload(input, {
        attempts: decision.attempt,
        terminal: false,
        error_category: classified.category,
        failure_class: classified.failureClass,
        decision: "retry_scheduled",
        next_retry_at: decision.nextAttemptAt,
        delay_ms: decision.delayMs,
      }),
    });
    return {
      status: "retry",
      attempt: decision.attempt,
      nextAttemptAt: decision.nextAttemptAt,
      errorCategory: classified.category,
      error: errorText,
    };
  }

  await writeNotificationLog({
    booking_id: input.bookingId ?? null,
    channel: "push",
    template_key: input.templateKey,
    recipient: input.token,
    status: "failed",
    error: errorText,
    provider: "expo",
    role: input.role,
    event_type: input.eventType,
    payload: buildRetryPayload(input, {
      attempts: decision.attempt,
      terminal: true,
      error_category: classified.category,
      failure_class: classified.failureClass,
      decision: "dead_letter",
      dead_letter_reason: decision.reason,
      next_retry_at: null,
    }),
  });

  return {
    status: "dead_letter",
    attempt: decision.attempt,
    errorCategory: classified.category,
    error: errorText,
  };
}
