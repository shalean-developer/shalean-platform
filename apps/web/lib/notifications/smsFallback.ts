import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import type { SmsRole } from "@/lib/notifications/smsPolicy";

export type { SmsRole } from "@/lib/notifications/smsPolicy";

export type SmsFallbackResult = {
  sent: boolean;
  /** Machine-readable reason when `sent` is false (Twilio error, invalid destination, or not configured). */
  error: string | null;
  /** Twilio `MessageSid` when Twilio accepted the message (for ops / delivery debugging). */
  messageSid: string | null;
};

export type SmsFallbackDeliveryLog = {
  templateKey: string;
  /** Overrides `context.bookingId` when set. */
  bookingId?: string | null;
  eventType: string;
  role: "cleaner" | "customer";
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    return { sent: false, error: "admin_sms_disabled_by_policy", messageSid: null };
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
    const result = { sent: false, error: "invalid_sms_destination", messageSid: null } as const;
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
    const result = { sent: false, error: "twilio_not_configured", messageSid: null } as const;
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
  const recipientE164 = to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`;
  const maxAttempts = 3;
  let lastError = "sms_fallback_failed";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const form = new URLSearchParams();
    form.set("To", recipientE164);
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
      if (res.ok) {
        await logSystemEvent({
          level: "info",
          source: "sms_fallback_sent",
          message: "SMS sent",
          context: { ...context, sms_attempt: attempt + 1 },
        });
        let messageSid: string | null = null;
        try {
          const bodyJson = (await res.json()) as { sid?: string };
          if (typeof bodyJson.sid === "string" && bodyJson.sid.trim()) messageSid = bodyJson.sid.trim();
        } catch {
          /* ignore parse errors */
        }
        const ok = { sent: true, error: null, messageSid } as const;
        await writeSmsDeliveryLog({
          deliveryLog: params.deliveryLog,
          context,
          body: params.body,
          recipient: recipientE164,
          result: ok,
        });
        return ok;
      }

      const t = await res.text();
      lastError = `twilio_${res.status}: ${t.slice(0, 400)}`;
      await reportOperationalIssue("warn", "sms_fallback", lastError, { ...context, sms_attempt: attempt + 1 });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === maxAttempts - 1) {
        const result = { sent: false, error: lastError, messageSid: null } as const;
        await writeSmsDeliveryLog({
          deliveryLog: params.deliveryLog,
          context,
          body: params.body,
          recipient: recipientE164,
          result,
        });
        return result;
      }
      await sleep(Math.round(400 * (attempt + 1) * (1 + Math.random() * 0.2)));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("warn", "sms_fallback", lastError, { ...context, sms_attempt: attempt + 1 });
      if (attempt === maxAttempts - 1) {
        const result = { sent: false, error: lastError, messageSid: null };
        await writeSmsDeliveryLog({
          deliveryLog: params.deliveryLog,
          context,
          body: params.body,
          recipient: recipientE164,
          result,
        });
        return result;
      }
      await sleep(Math.round(400 * (attempt + 1) * (1 + Math.random() * 0.2)));
    }
  }

  const result = { sent: false, error: lastError, messageSid: null };
  await writeSmsDeliveryLog({
    deliveryLog: params.deliveryLog,
    context,
    body: params.body,
    recipient: recipientE164,
    result,
  });
  return result;
}
