import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { resolveWhatsAppBearerToken } from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { abortWhatsAppQueueJob, enqueueWhatsApp, flushWhatsAppJobById } from "@/lib/whatsapp/queue";

export type NotificationLogRowForRetry = {
  id: string;
  booking_id: string | null;
  channel: string;
  template_key: string;
  recipient: string;
  status: string;
  provider: string;
  role: string | null;
  event_type: string | null;
  payload: Record<string, unknown> | null;
};

function metaToDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

const MAX_RETRY_CHAIN_DEPTH = 3;

function mergeRetryPayload(
  base: Record<string, unknown> | null | undefined,
  retriedFrom: string,
): Record<string, unknown> {
  const prev = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  const priorDepth = Number(prev.retry_chain_depth);
  const retry_chain_depth = (Number.isFinite(priorDepth) && priorDepth > 0 ? priorDepth : 0) + 1;
  return {
    ...prev,
    retried_from: retriedFrom,
    retry_at: new Date().toISOString(),
    retry_chain_depth,
  };
}

async function sendTwilioSms(toE164: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = toE164.replace(/\s/g, "");
  if (!sid || !token || !from) {
    return { ok: false, error: "twilio_not_configured" };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams();
  form.set("To", to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`);
  form.set("From", from);
  form.set("Body", body.slice(0, 1400));
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
    return { ok: false, error: `twilio_${res.status}: ${t.slice(0, 400)}` };
  }
  return { ok: true };
}

/**
 * Re-sends a previously logged outbound using stored `recipient` + `payload` (admin-only).
 * Writes a **new** `notification_logs` row (never mutates the original).
 */
export async function retryNotificationFromLog(row: NotificationLogRowForRetry): Promise<
  | { ok: true }
  | { ok: false; error: string; httpStatus: number }
> {
  if (row.status !== "failed") {
    return { ok: false, error: "Only failed rows can be retried.", httpStatus: 400 };
  }

  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const chainDepth = Number((payload as Record<string, unknown>).retry_chain_depth);
  const effectiveDepth = Number.isFinite(chainDepth) && chainDepth > 0 ? chainDepth : 0;
  if (effectiveDepth >= MAX_RETRY_CHAIN_DEPTH) {
    return {
      ok: false,
      error: `Maximum of ${MAX_RETRY_CHAIN_DEPTH} automated retries reached for this delivery chain.`,
      httpStatus: 429,
    };
  }
  const baseLog = {
    booking_id: row.booking_id,
    template_key: row.template_key,
    recipient: row.recipient,
    role: row.role,
    event_type: row.event_type,
    payload: mergeRetryPayload(payload as Record<string, unknown>, row.id),
  };

  if (row.channel === "email" && row.provider === "resend") {
    const subject = typeof payload.subject === "string" ? payload.subject : "";
    const html = typeof payload.html === "string" ? payload.html : "";
    if (!subject || !html) {
      return { ok: false, error: "Email retry requires payload.subject and payload.html.", httpStatus: 400 };
    }
    const resend = getResend();
    if (!resend) {
      await writeNotificationLog({
        ...baseLog,
        channel: "email",
        status: "failed",
        error: "resend_not_configured",
        provider: "resend",
      });
      return { ok: false, error: "Resend is not configured.", httpStatus: 503 };
    }
    try {
      const { error } = await resend.emails.send({
        from: getDefaultFromAddress(),
        to: row.recipient,
        subject,
        html,
      });
      if (error) {
        await writeNotificationLog({
          ...baseLog,
          channel: "email",
          status: "failed",
          error: error.message,
          provider: "resend",
        });
        return { ok: false, error: error.message, httpStatus: 502 };
      }
      await writeNotificationLog({
        ...baseLog,
        channel: "email",
        status: "sent",
        error: null,
        provider: "resend",
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeNotificationLog({
        ...baseLog,
        channel: "email",
        status: "failed",
        error: msg,
        provider: "resend",
      });
      return { ok: false, error: msg, httpStatus: 502 };
    }
  }

  if (row.channel === "whatsapp" && row.provider === "meta") {
    if (String(row.role ?? "").toLowerCase() === "customer") {
      return {
        ok: false,
        error: "Customer WhatsApp retry is disabled by communication policy.",
        httpStatus: 400,
      };
    }
    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text.trim()) {
      return { ok: false, error: "WhatsApp retry requires payload.text.", httpStatus: 400 };
    }
    const digits = metaToDigits(row.recipient);
    if (digits.length < 10) {
      return { ok: false, error: "Invalid WhatsApp recipient on log row.", httpStatus: 400 };
    }
    const hasWa = Boolean(resolveWhatsAppBearerToken() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
    if (process.env.NODE_ENV === "production" && !hasWa) {
      await writeNotificationLog({
        ...baseLog,
        channel: "whatsapp",
        status: "failed",
        error: "whatsapp_not_configured",
        provider: "meta",
      });
      return { ok: false, error: "WhatsApp is not configured.", httpStatus: 503 };
    }
    const devSkip =
      process.env.NODE_ENV !== "production" &&
      (process.env.WHATSAPP_DEV_MODE === "true" || !hasWa);
    if (devSkip) {
      await logSystemEvent({
        level: "info",
        source: "admin_notification_retry_whatsapp_dev",
        message: "WhatsApp retry skipped real send (dev / missing token)",
        context: { retried_from: row.id, to: digits },
      });
      await writeNotificationLog({
        ...baseLog,
        channel: "whatsapp",
        status: "sent",
        error: null,
        provider: "meta",
      });
      return { ok: true };
    }
    const admin = getSupabaseAdmin();
    if (!admin) {
      await writeNotificationLog({
        ...baseLog,
        channel: "whatsapp",
        status: "failed",
        error: "supabase_admin_not_configured",
        provider: "meta",
      });
      return { ok: false, error: "Supabase is not configured.", httpStatus: 503 };
    }
    const enq = await enqueueWhatsApp({
      admin,
      phone: digits,
      phoneRaw: row.recipient,
      type: "text",
      payload: { kind: "text", text },
      context: { retried_from: row.id, source: "admin_notification_retry" },
      idempotencyKey: `admin_retry:${row.id}`,
      priority: 40,
    });
    if (enq.id === null) {
      await writeNotificationLog({
        ...baseLog,
        channel: "whatsapp",
        status: "failed",
        error: enq.error,
        provider: "meta",
      });
      return { ok: false, error: enq.error, httpStatus: 502 };
    }
    const flush = await flushWhatsAppJobById(admin, enq.id);
    if (!flush.ok) {
      const msg = flush.error ?? "whatsapp_flush_failed";
      await abortWhatsAppQueueJob(admin, enq.id, `admin_retry_abort:${msg}`);
      await writeNotificationLog({
        ...baseLog,
        channel: "whatsapp",
        status: "failed",
        error: msg,
        provider: "meta",
      });
      return { ok: false, error: msg, httpStatus: 502 };
    }
    await writeNotificationLog({
      ...baseLog,
      channel: "whatsapp",
      status: "sent",
      error: null,
      provider: "meta",
    });
    return { ok: true };
  }

  if (row.channel === "sms" && row.provider === "twilio") {
    if (String(row.role ?? "").toLowerCase() === "admin") {
      return {
        ok: false,
        error: "Admin SMS retry is disabled by communication policy.",
        httpStatus: 400,
      };
    }
    const text =
      typeof payload.text === "string"
        ? payload.text
        : typeof payload.body === "string"
          ? payload.body
          : "";
    if (!text.trim()) {
      return { ok: false, error: "SMS retry requires payload.text or payload.body.", httpStatus: 400 };
    }
    const tw = await sendTwilioSms(row.recipient, text);
    if (!tw.ok) {
      await writeNotificationLog({
        ...baseLog,
        channel: "sms",
        status: "failed",
        error: tw.error,
        provider: "twilio",
      });
      return { ok: false, error: tw.error, httpStatus: tw.error === "twilio_not_configured" ? 503 : 502 };
    }
    await writeNotificationLog({
      ...baseLog,
      channel: "sms",
      status: "sent",
      error: null,
      provider: "twilio",
    });
    return { ok: true };
  }

  return {
    ok: false,
    error: `Retry not supported for channel=${row.channel} provider=${row.provider}.`,
    httpStatus: 400,
  };
}
