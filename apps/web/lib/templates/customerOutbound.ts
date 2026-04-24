import type { BookingEmailPayload } from "@/lib/email/sendBookingEmail";
import { buildBookingConfirmedTemplateData } from "@/lib/email/sendBookingEmail";
import { trySendCleanerWhatsAppMessage } from "@/lib/dispatch/offerNotifications";
import { estimatedNotificationCostUsd, NOTIFICATION_COST_CURRENCY } from "@/lib/notifications/notificationCostEstimates";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { isWhatsappOutboundPaused } from "@/lib/notifications/notificationRuntimeFlags";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { getVariableAllowlistFromRow, renderTemplate } from "@/lib/templates/render";
import { getTemplate } from "@/lib/templates/store";

export { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";

function bookingIdFromContext(context: Record<string, unknown>): string | null {
  const b = context.bookingId;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

const CUSTOMER_NOTIFY_ROLE = "customer";
const CUSTOMER_PAYMENT_EVENT = "payment_confirmed";

function customerNotifyPayload(extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, step: CUSTOMER_PAYMENT_EVENT };
}

/** Structured routing / ops fields merged into `notification_logs.payload`. */
export type CustomerOutboundDecisionTrace = {
  decision: string;
  country?: string | null;
  preferred_channel?: string | null;
  contact_health_score?: number | null;
  contact_health_sample_size?: number | null;
};

function buildCustomerOutboundPayload(
  channel: "whatsapp" | "sms",
  extra: Record<string, unknown>,
  decisionTrace?: CustomerOutboundDecisionTrace | null,
): Record<string, unknown> {
  const out = customerNotifyPayload({
    ...extra,
    cost_estimate: estimatedNotificationCostUsd(channel),
    currency: NOTIFICATION_COST_CURRENCY,
  });
  if (decisionTrace) {
    out.decision = decisionTrace.decision;
    if (decisionTrace.country != null) out.country = decisionTrace.country;
    if (decisionTrace.preferred_channel != null) out.preferred_channel = decisionTrace.preferred_channel;
    if (decisionTrace.contact_health_score != null) out.contact_health_score = decisionTrace.contact_health_score;
    if (decisionTrace.contact_health_sample_size != null) {
      out.contact_health_sample_size = decisionTrace.contact_health_sample_size;
    }
  }
  return out;
}

/** Renders and sends WhatsApp using Meta Cloud API when configured (same transport as cleaner offers). */
export async function sendCustomerWhatsAppFromTemplate(params: {
  phone: string;
  templateKey: "booking_confirmed";
  payload: BookingEmailPayload;
  context: Record<string, unknown>;
  /** Log when SMS was tried first for this region and WhatsApp is the fallback. */
  channelFallbackFrom?: "sms";
  decisionTrace?: CustomerOutboundDecisionTrace | null;
}): Promise<{ ok: boolean }> {
  const template = await getTemplate(params.templateKey, "whatsapp");
  const bid = bookingIdFromContext(params.context);
  const trimmedPhone = params.phone.trim();
  const recipient = (customerPhoneToE164(trimmedPhone) || trimmedPhone).slice(0, 64);
  const trace = params.decisionTrace ?? null;
  if (!template) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "whatsapp",
      template_key: params.templateKey,
      recipient,
      status: "failed",
      error: "template_not_found",
      provider: "meta",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: buildCustomerOutboundPayload("whatsapp", { source: "customer_template" }, trace),
    });
    return { ok: false };
  }

  const allow = getVariableAllowlistFromRow(template);
  const data = buildBookingConfirmedTemplateData(params.payload) as Record<string, unknown>;
  const message = renderTemplate(template.content, data, {
    allowedKeys: allow.length ? allow : undefined,
    stripAngleBrackets: true,
  });

  const paused = await isWhatsappOutboundPaused();
  if (paused.paused) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "whatsapp",
      template_key: params.templateKey,
      recipient,
      status: "failed",
      error: "whatsapp_channel_paused",
      provider: "meta",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: buildCustomerOutboundPayload(
        "whatsapp",
        {
          text: message,
          source: `customer_${params.templateKey}_whatsapp`,
          paused_until: paused.untilIso,
        },
        trace,
      ),
    });
    return { ok: false };
  }

  const wa = await trySendCleanerWhatsAppMessage({
    cleanerPhone: params.phone,
    message,
    source: `customer_${params.templateKey}_whatsapp`,
    context: params.context,
  });

  const waFb = params.channelFallbackFrom;
  await writeNotificationLog({
    booking_id: bid,
    channel: "whatsapp",
    template_key: params.templateKey,
    recipient,
    status: wa.ok ? "sent" : "failed",
    error: wa.ok ? null : (wa.reason ?? "unknown"),
    provider: "meta",
    role: CUSTOMER_NOTIFY_ROLE,
    event_type: CUSTOMER_PAYMENT_EVENT,
    payload: buildCustomerOutboundPayload(
      "whatsapp",
      {
        text: message,
        source: `customer_${params.templateKey}_whatsapp`,
        ...(waFb
          ? { primary_channel_failed: true, failed_primary_channel: waFb, automated_channel_fallback: true }
          : {}),
      },
      trace,
    ),
  });
  return { ok: wa.ok };
}

export async function sendCustomerSmsFromTemplate(params: {
  phone: string;
  templateKey: "booking_confirmed";
  payload: BookingEmailPayload;
  context: Record<string, unknown>;
  /** When set, this channel is an automated fallback after the other channel did not succeed. */
  channelFallbackFrom?: "whatsapp";
  decisionTrace?: CustomerOutboundDecisionTrace | null;
}): Promise<{ ok: boolean }> {
  const template = await getTemplate(params.templateKey, "sms");
  const bid = bookingIdFromContext(params.context);
  const recipientRaw = params.phone.trim().slice(0, 64);
  const trace = params.decisionTrace ?? null;
  if (!template) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "sms",
      template_key: params.templateKey,
      recipient: recipientRaw,
      status: "failed",
      error: "template_not_found",
      provider: "twilio",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: buildCustomerOutboundPayload("sms", { source: "customer_template" }, trace),
    });
    return { ok: false };
  }

  const allow = getVariableAllowlistFromRow(template);
  const data = buildBookingConfirmedTemplateData(params.payload) as Record<string, unknown>;
  const body = renderTemplate(template.content, data, {
    allowedKeys: allow.length ? allow : undefined,
    stripAngleBrackets: true,
  });

  const e164 = customerPhoneToE164(params.phone);
  if (!e164) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "sms",
      template_key: params.templateKey,
      recipient: recipientRaw,
      status: "failed",
      error: "invalid_phone_e164",
      provider: "twilio",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: buildCustomerOutboundPayload("sms", { text: body }, trace),
    });
    return { ok: false };
  }

  const smsRes = await sendSmsFallback({
    toE164: e164,
    body,
    context: { ...params.context, channel: "customer_template_sms", templateKey: params.templateKey },
  });

  const fb = params.channelFallbackFrom;
  await writeNotificationLog({
    booking_id: bid,
    channel: "sms",
    template_key: params.templateKey,
    recipient: e164,
    status: smsRes.sent ? "sent" : "failed",
    error: smsRes.sent ? null : smsRes.error,
    provider: "twilio",
    role: CUSTOMER_NOTIFY_ROLE,
    event_type: CUSTOMER_PAYMENT_EVENT,
    payload: buildCustomerOutboundPayload(
      "sms",
      {
        text: body,
        source: `customer_${params.templateKey}_sms`,
        ...(fb
          ? { primary_channel_failed: true, failed_primary_channel: fb, automated_channel_fallback: true }
          : {}),
      },
      trace,
    ),
  });
  return { ok: smsRes.sent };
}
