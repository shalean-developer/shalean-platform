import { maskNotificationRecipient } from "@/lib/notifications/retryContract";

export type NotificationLogLike = {
  id: string;
  channel: string;
  recipient: string | null;
  event_type: string | null;
  booking_id: string | null;
  status: string;
  error: string | null;
  provider: string | null;
  role: string | null;
  created_at: string;
  payload?: Record<string, unknown> | null;
};

export type DeadLetterOperatorView = {
  notificationId: string;
  channel: string;
  recipientMasked: string;
  eventType: string | null;
  bookingId: string | null;
  userReference: string | null;
  attemptCount: number;
  lastErrorCategory: string | null;
  nextRetryAt: string | null;
  terminal: boolean;
  createdAt: string;
  updatedAt: string | null;
  provider: string | null;
  role: string | null;
  lastError: string | null;
  operatorRetryAllowed: boolean;
};

/**
 * Shape a notification_logs row for office dead-letter / retry UI.
 * Customer and cleaner roles must never receive this structure via their APIs.
 */
export function buildDeadLetterOperatorView(row: NotificationLogLike): DeadLetterOperatorView {
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : {};
  const attemptsRaw = Number(payload.attempts ?? payload.retry_chain_depth ?? 1);
  const attemptCount = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.floor(attemptsRaw) : 1;
  const terminal = payload.terminal === true || row.status === "failed" && payload.decision === "dead_letter";
  const nextRetryAt =
    typeof payload.next_retry_at === "string"
      ? payload.next_retry_at
      : typeof payload.nextAttemptAt === "string"
        ? payload.nextAttemptAt
        : null;
  const lastErrorCategory =
    typeof payload.error_category === "string"
      ? payload.error_category
      : typeof payload.failure_class === "string"
        ? payload.failure_class
        : null;
  const userReference =
    typeof payload.user_id === "string"
      ? payload.user_id
      : typeof payload.userId === "string"
        ? payload.userId
        : null;
  const chainDepth = Number(payload.retry_chain_depth);
  const operatorRetryAllowed =
    row.status === "failed" &&
    !(Number.isFinite(chainDepth) && chainDepth >= 3) &&
    (row.channel === "email" ||
      row.channel === "whatsapp" ||
      row.channel === "sms" ||
      row.channel === "push");

  return {
    notificationId: row.id,
    channel: row.channel,
    recipientMasked: maskNotificationRecipient(row.recipient ?? ""),
    eventType: row.event_type,
    bookingId: row.booking_id,
    userReference,
    attemptCount,
    lastErrorCategory,
    nextRetryAt: terminal ? null : nextRetryAt,
    terminal: Boolean(terminal) || (row.status === "failed" && !nextRetryAt),
    createdAt: row.created_at,
    updatedAt: typeof payload.retry_at === "string" ? payload.retry_at : null,
    provider: row.provider,
    role: row.role,
    lastError: row.error,
    operatorRetryAllowed,
  };
}
