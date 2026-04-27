import "server-only";

import type { CustomerPaymentLinkWhatsAppPayload } from "@/lib/templates/customerOutbound";
import { sendCustomerSmsPaymentLink } from "@/lib/templates/customerOutbound";
import type { PaymentLinkEmailInput } from "@/lib/email/sendBookingEmail";
import { sendPaymentLinkEmail } from "@/lib/email/sendBookingEmail";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizePhoneTryOrder } from "@/lib/pay/paymentDecisionEngine";

export type AdminPaymentLinkDeliveryMode = "chain" | "chain_plus_email";

export type PaymentLinkChannelOutcome = "sent" | "failed" | "skipped";

export type AdminPaymentLinkDeliveryResult = {
  whatsappOk: boolean | null;
  smsOk: boolean | null;
  emailOk: boolean | null;
  /** First channel that delivered, or `email` when chain fell through. */
  primaryChannel: "whatsapp" | "sms" | "email" | "none";
  fallbackTrace: string;
  /** Structured outcome per channel (stored on `bookings.payment_link_delivery`). */
  byChannel: {
    whatsapp: PaymentLinkChannelOutcome;
    sms: PaymentLinkChannelOutcome;
    email: PaymentLinkChannelOutcome;
  };
};

/**
 * Phone delivery uses SMS only (customer WhatsApp is disabled by policy).
 * `phoneTryOrder` may still list `whatsapp` from the payment engine — those steps are skipped.
 * Email follows existing `mode` rules.
 */
export async function deliverAdminPaymentLink(params: {
  phone: string | null | undefined;
  email: string | null | undefined;
  emailPayload: PaymentLinkEmailInput;
  waPayload: CustomerPaymentLinkWhatsAppPayload;
  context: Record<string, unknown>;
  mode: AdminPaymentLinkDeliveryMode;
  /** Preferred phone attempt order; missing channel is appended for full fallback. */
  phoneTryOrder?: ("whatsapp" | "sms")[];
}): Promise<AdminPaymentLinkDeliveryResult> {
  const phone = params.phone?.trim() || "";
  const email = params.email?.trim() || "";
  let whatsappOk: boolean | null = null;
  let smsOk: boolean | null = null;
  let emailOk: boolean | null = null;
  let primaryChannel: AdminPaymentLinkDeliveryResult["primaryChannel"] = "none";
  const trace: string[] = [];

  let phoneDelivered = false;
  if (phone) {
    const order = normalizePhoneTryOrder(params.phoneTryOrder?.length ? params.phoneTryOrder : ["whatsapp", "sms"]);

    for (const step of order) {
      if (phoneDelivered) break;

      if (step === "whatsapp") {
        // Customer WhatsApp disabled — cleaners only; never call Meta for customer phones.
        trace.push("whatsapp_skipped_customer_policy");
        continue;
      }

      const sms = await sendCustomerSmsPaymentLink({
        phone,
        payload: params.waPayload,
        context: params.context,
      });
      smsOk = sms.ok;
      if (sms.ok) {
        phoneDelivered = true;
        primaryChannel = "sms";
        trace.push("sms_ok");
      } else {
        trace.push("sms_failed");
        await logSystemEvent({
          level: "warn",
          source: "admin_payment_link_delivery",
          message: "sms_failed_try_next_channel",
          context: { ...params.context, step: "payment_link" },
        });
      }
    }

    if (!phoneDelivered) {
      await logSystemEvent({
        level: "warn",
        source: "admin_payment_link_delivery",
        message: "phone_channels_exhausted_use_email",
        context: { ...params.context, step: "payment_link" },
      });
    }
  } else {
    trace.push("no_phone");
  }

  const sendEmail =
    Boolean(email) &&
    (params.mode === "chain_plus_email" || !phone || !phoneDelivered);

  if (sendEmail && email) {
    const em = await sendPaymentLinkEmail(params.emailPayload);
    emailOk = em.sent;
    if (em.sent) {
      if (!phoneDelivered) primaryChannel = "email";
      trace.push(params.mode === "chain_plus_email" && phoneDelivered ? "email_receipt" : "email_sent");
    } else {
      trace.push("email_failed");
    }
  }

  if (primaryChannel === "none" && emailOk) primaryChannel = "email";

  const byChannel = {
    whatsapp: (whatsappOk === null ? "skipped" : whatsappOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
    sms: (smsOk === null ? "skipped" : smsOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
    email: (emailOk === null ? "skipped" : emailOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
  };

  return {
    whatsappOk,
    smsOk,
    emailOk,
    primaryChannel,
    fallbackTrace: trace.join(","),
    byChannel,
  };
}
