import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import type { SmsRole } from "@/lib/notifications/smsPolicy";

export type { SmsRole } from "@/lib/notifications/smsPolicy";

export type SmsFallbackResult = {
  sent: boolean;
  /** Machine-readable reason when `sent` is false (Twilio error, invalid destination, or not configured). */
  error: string | null;
};

export type SmsFallbackDeliveryLog = {
  templateKey: string;
  /** Overrides `context.bookingId` when set. */
  bookingId?: string | null;
  eventType: string;
  role: "cleaner";
};

function bookingIdForSmsLog(
  deliveryLog: SmsFallbackDeliveryLog | undefined,
  context: Record<string, unknown>,
): string | null {
  const fromArg = deliveryLog?.bookingId?.trim();
  if (fromArg) return fromArg;
  const b = context.bookingId;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

async function writeSmsDeliveryLog(params: {
  deliveryLog: SmsFallbackDeliveryLog | undefined;
  context: Record<string, unknown>;
  body: string;
  recipient: string;
  result: SmsFallbackResult;
}): Promise<void> {
  if (!params.deliveryLog) return;
  const step = params.deliveryLog.eventType;
  const smsRole = params.context.sms_role;
  await writeNotificationLog({
    booking_id: bookingIdForSmsLog(params.deliveryLog, params.context),
    channel: "sms",
    template_key: params.deliveryLog.templateKey,
    recipient: params.recipient.slice(0, 64),
    status: params.result.sent ? "sent" : "failed",
    error: params.result.error,
    provider: "twilio",
    role: params.deliveryLog.role,
    event_type: params.deliveryLog.eventType,
    payload: {
      text: params.body.slice(0, 1400),
      step,
      ...(smsRole === "fallback" || smsRole === "primary" ? { sms_role: smsRole } : {}),
    },
  });
}

/**
 * Optional Twilio SMS. Configure: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164).
 * `sent` is true only when Twilio accepted the message.
 *
 * Pass `deliveryLog` for cleaner dispatch fallbacks so attempts appear in `notification_logs`.
 * Customer template SMS omits this (logged in `customerOutbound`).
 */
export async function sendSmsFallback(params: {
  toE164: string;
  body: string;
  context: Record<string, unknown>;
  deliveryLog?: SmsFallbackDeliveryLog;
  /** When set, merged into `context` for logs / notification payload. */
  smsRole?: SmsRole;
  /** Blocks SMS entirely for admin recipients (email-only policy). */
  recipientKind?: "customer" | "cleaner" | "admin";
}): Promise<SmsFallbackResult> {
  if (params.recipientKind === "admin") {
    await logSystemEvent({
      level: "warn",
      source: "sms_fallback_blocked",
      message: "admin_sms_disabled_by_policy",
      context: { ...params.context },
    });
    return { sent: false, error: "admin_sms_disabled_by_policy" };
  }

  const context: Record<string, unknown> = {
    ...params.context,
    ...(params.smsRole ? { sms_role: params.smsRole } : {}),
  };

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = params.toE164.replace(/\s/g, "");
  const recipientForLog = (to || params.toE164.trim() || "(unknown)").slice(0, 64);

  if (!to || !/^\+?\d{10,15}$/.test(to.replace(/^\+/, ""))) {
    await logSystemEvent({
      level: "warn",
      source: "sms_fallback_invalid_to",
      message: "Invalid SMS destination",
      context: { ...context, to: params.toE164 },
    });
    const result = { sent: false, error: "invalid_sms_destination" } as const;
    await writeSmsDeliveryLog({
      deliveryLog: params.deliveryLog,
      context,
      body: params.body,
      recipient: recipientForLog,
      result,
    });
    return result;
  }
  if (!sid || !token || !from) {
    await logSystemEvent({
      level: "info",
      source: "sms_fallback_disabled",
      message: "Twilio not configured — SMS skipped",
      context,
    });
    const result = { sent: false, error: "twilio_not_configured" } as const;
    await writeSmsDeliveryLog({
      deliveryLog: params.deliveryLog,
      context,
      body: params.body,
      recipient: to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`,
      result,
    });
    return result;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams();
  form.set("To", to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`);
  form.set("From", from);
  form.set("Body", params.body.slice(0, 1400));

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const t = await res.text();
      const err = `twilio_${res.status}: ${t.slice(0, 400)}`;
      await reportOperationalIssue("warn", "sms_fallback", err, context);
      const result = { sent: false, error: err };
      await writeSmsDeliveryLog({
        deliveryLog: params.deliveryLog,
        context,
        body: params.body,
        recipient: to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`,
        result,
      });
      return result;
    }
    await logSystemEvent({
      level: "info",
      source: "sms_fallback_sent",
      message: "SMS sent",
      context,
    });
    const ok = { sent: true, error: null } as const;
    await writeSmsDeliveryLog({
      deliveryLog: params.deliveryLog,
      context,
      body: params.body,
      recipient: to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`,
      result: ok,
    });
    return ok;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "sms_fallback", msg, context);
    const result = { sent: false, error: msg };
    await writeSmsDeliveryLog({
      deliveryLog: params.deliveryLog,
      context,
      body: params.body,
      recipient: to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`,
      result,
    });
    return result;
  }
}
