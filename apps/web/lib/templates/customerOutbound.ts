import type { BookingEmailPayload } from "@/lib/email/sendBookingEmail";
import { buildBookingConfirmedTemplateData } from "@/lib/email/sendBookingEmail";
import { estimatedNotificationCostUsd, NOTIFICATION_COST_CURRENCY } from "@/lib/notifications/notificationCostEstimates";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
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
const PAYMENT_LINK_SENT_EVENT = "payment_link_sent";

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

/**
 * Customer WhatsApp is disabled by communication policy (WhatsApp → cleaners only).
 * @deprecated Do not call — retained so accidental imports fail loudly at runtime.
 */
export async function sendCustomerWhatsAppFromTemplate(_params: {
  phone: string;
  templateKey: "booking_confirmed";
  payload: BookingEmailPayload;
  context: Record<string, unknown>;
  channelFallbackFrom?: "sms";
  decisionTrace?: CustomerOutboundDecisionTrace | null;
}): Promise<{ ok: boolean }> {
  void _params;
  throw new Error("Customer WhatsApp disabled by communication policy");
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

export type CustomerPaymentLinkWhatsAppPayload = {
  customerName: string;
  paymentLink: string;
  service: string;
  date: string;
  time: string;
};

function customerPaymentLinkPayload(extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, step: PAYMENT_LINK_SENT_EVENT };
}

/**
 * Customer WhatsApp is disabled by communication policy (WhatsApp → cleaners only).
 * @deprecated Do not call — use SMS / email for payment links.
 */
export async function sendCustomerWhatsAppPaymentLink(_params: {
  phone: string;
  payload: CustomerPaymentLinkWhatsAppPayload;
  context: Record<string, unknown>;
}): Promise<{ ok: boolean }> {
  void _params;
  throw new Error("Customer WhatsApp disabled by communication policy");
}

/** SMS for `payment_request` template (phone channel when email is not used alone). */
export async function sendCustomerSmsPaymentLink(params: {
  phone: string;
  payload: CustomerPaymentLinkWhatsAppPayload;
  context: Record<string, unknown>;
}): Promise<{ ok: boolean }> {
  const templateKey = "payment_request";
  const template = await getTemplate(templateKey, "sms");
  const bid = bookingIdFromContext(params.context);
  const recipientRaw = params.phone.trim().slice(0, 64);

  if (!template) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "sms",
      template_key: templateKey,
      recipient: recipientRaw,
      status: "failed",
      error: "template_not_found",
      provider: "twilio",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: PAYMENT_LINK_SENT_EVENT,
      payload: customerPaymentLinkPayload({ source: "customer_template" }),
    });
    return { ok: false };
  }

  const allow = getVariableAllowlistFromRow(template);
  const bookingIdShort = bid ? bid.slice(0, 8) : "—";
  const data: Record<string, unknown> = {
    payment_link: params.payload.paymentLink,
    booking_id: bid ?? bookingIdShort,
  };
  const body = renderTemplate(template.content, data, {
    allowedKeys: allow.length ? allow : undefined,
    stripAngleBrackets: true,
  });

  const e164 = customerPhoneToE164(params.phone);
  if (!e164) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "sms",
      template_key: templateKey,
      recipient: recipientRaw,
      status: "failed",
      error: "invalid_phone_e164",
      provider: "twilio",
      role: CUSTOMER_NOTIFY_ROLE,
      event_type: PAYMENT_LINK_SENT_EVENT,
      payload: customerPaymentLinkPayload({ text: body }),
    });
    return { ok: false };
  }

  const smsRes = await sendSmsFallback({
    toE164: e164,
    body,
    context: { ...params.context, channel: "customer_template_sms", templateKey },
  });

  await writeNotificationLog({
    booking_id: bid,
    channel: "sms",
    template_key: templateKey,
    recipient: e164,
    status: smsRes.sent ? "sent" : "failed",
    error: smsRes.sent ? null : smsRes.error,
    provider: "twilio",
    role: CUSTOMER_NOTIFY_ROLE,
    event_type: PAYMENT_LINK_SENT_EVENT,
    payload: customerPaymentLinkPayload({
      text: body,
      source: `customer_${templateKey}_sms`,
    }),
  });
  return { ok: smsRes.sent };
}
