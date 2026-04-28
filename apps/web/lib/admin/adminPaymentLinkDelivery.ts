import "server-only";

import type { CustomerPaymentLinkWhatsAppPayload, SmsRole } from "@/lib/templates/customerOutbound";
import { sendCustomerSmsPaymentLink } from "@/lib/templates/customerOutbound";
import type { PaymentLinkEmailInput } from "@/lib/email/sendBookingEmail";
import { sendPaymentLinkEmail } from "@/lib/email/sendBookingEmail";
import {
  assignConversionExperimentVariant,
  maybeDelayPaymentLinkEmailExperiment,
} from "@/lib/conversion/assignConversionExperiment";
import {
  enqueueDeferredPaymentLinkEmail,
  paymentLinkEmailDelaySecondsCap,
  useAsyncPaymentLinkEmailDelay,
} from "@/lib/conversion/deferredPaymentLinkEmailQueue";
import { applySendDelayIfNeeded } from "@/lib/ai-autonomy/optimizeTiming";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizePhoneTryOrder } from "@/lib/pay/paymentDecisionEngine";
import type { SupabaseClient } from "@supabase/supabase-js";

/** @deprecated Delivery order is always email first, then SMS if needed. Kept for API compatibility. */
export type AdminPaymentLinkDeliveryMode = "chain" | "chain_plus_email";

export type PaymentLinkChannelOutcome = "sent" | "failed" | "skipped";

/** How SMS was used when sent (stored on `payment_link_delivery` as `sms_role`). */
export type SmsDeliveryRole = SmsRole | "none";

export type PaymentLinkDeliveryTrace = {
  email: "sent" | "failed" | "skipped";
  sms: "sent" | "failed" | "skipped" | "fallback";
};

export type AdminPaymentLinkDeliveryResult = {
  whatsappOk: boolean | null;
  smsOk: boolean | null;
  emailOk: boolean | null;
  /** Twilio SMS message id when SMS was accepted (customer policy uses SMS, not WhatsApp). */
  twilioSmsSid: string | null;
  /** First channel that successfully delivered to the customer. */
  primaryChannel: "whatsapp" | "sms" | "email" | "none";
  fallbackTrace: string;
  /** Structured outcome per channel (stored on `bookings.payment_link_delivery`). */
  byChannel: {
    whatsapp: PaymentLinkChannelOutcome;
    sms: PaymentLinkChannelOutcome;
    email: PaymentLinkChannelOutcome;
  };
  /** When SMS was sent: after a failed/missing email attempt vs phone-only. */
  smsDeliveryRole: SmsDeliveryRole;
  /** Log-friendly channel summary (`sms: "fallback"` = SMS after email did not succeed). */
  delivery: PaymentLinkDeliveryTrace;
  /** When email was queued for async send (experiments); suppress SMS until worker runs. */
  emailDeferredUntilIso?: string | null;
};

function buildDeliveryTrace(
  email: PaymentLinkChannelOutcome,
  sms: PaymentLinkChannelOutcome,
  smsRole: SmsDeliveryRole,
): PaymentLinkDeliveryTrace {
  const smsLabel: PaymentLinkDeliveryTrace["sms"] =
    sms === "sent" && smsRole === "fallback"
      ? "fallback"
      : sms === "sent"
        ? "sent"
        : sms === "failed"
          ? "failed"
          : "skipped";
  return { email, sms: smsLabel };
}

/**
 * Customer payment link delivery: **email first**, SMS **only** if email is missing or failed.
 * Customer WhatsApp is never used (policy); `phoneTryOrder` may list `whatsapp` — those steps are skipped.
 *
 * `mode` is ignored for ordering (legacy `chain` / `chain_plus_email` both map to this behavior).
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
  /** When set with `bookingId`, runs conversion experiments (timing + copy) without changing SMS policy. */
  supabaseAdmin?: SupabaseClient | null;
  bookingId?: string | null;
  /** When set with `supabaseAdmin`, optional AI send-timing delay (Phase 8; `AI_*` flags). */
  userId?: string | null;
  /** Admin resend: skip Twilio/SMS (e.g. after SMS failure when email is available). */
  skipSms?: boolean;
}): Promise<AdminPaymentLinkDeliveryResult> {
  const phone = params.phone?.trim() || "";
  const email = params.email?.trim() || "";
  let whatsappOk: boolean | null = null;
  let smsOk: boolean | null = null;
  let emailOk: boolean | null = null;
  let primaryChannel: AdminPaymentLinkDeliveryResult["primaryChannel"] = "none";
  const trace: string[] = ["email_first_enforced"];

  if (!email && !phone) {
    await logSystemEvent({
      level: "warn",
      source: "admin_payment_link_delivery",
      message: "no_delivery_channel_available",
      context: { ...params.context, step: "payment_link" },
    });
    const byChannel = {
      whatsapp: "skipped" as const,
      sms: "skipped" as const,
      email: "skipped" as const,
    };
    return {
      whatsappOk,
      smsOk,
      emailOk,
      twilioSmsSid: null,
      primaryChannel: "none",
      fallbackTrace: trace.concat("no_email_no_phone").join(","),
      byChannel,
      smsDeliveryRole: "none",
      delivery: buildDeliveryTrace("skipped", "skipped", "none"),
    };
  }

  let emailOutcome: PaymentLinkChannelOutcome = "skipped";
  let emailDeferredUntilIso: string | null = null;
  if (email) {
    let emailPayload = params.emailPayload;
    const bid = params.bookingId?.trim() || "";
    const admin = params.supabaseAdmin;
    if (admin && bid) {
      const stageStr = String(params.context?.stage ?? "");
      const skipEmailTimingDelay = /reminder|resend/i.test(stageStr);
      const timing = await assignConversionExperimentVariant(admin, {
        subjectId: bid,
        experimentKey: "payment_email_timing",
      });
      const delaySec = paymentLinkEmailDelaySecondsCap();
      const deferAsync =
        !skipEmailTimingDelay &&
        timing.variant === "variant_a" &&
        delaySec > 0 &&
        useAsyncPaymentLinkEmailDelay();

      if (!deferAsync && !skipEmailTimingDelay) {
        await maybeDelayPaymentLinkEmailExperiment(timing.variant);
      }

      const copy = await assignConversionExperimentVariant(admin, {
        subjectId: bid,
        experimentKey: "email_copy_test",
      });
      await assignConversionExperimentVariant(admin, {
        subjectId: bid,
        experimentKey: "payment_reminder_timing",
      });
      emailPayload = {
        ...params.emailPayload,
        emailCopyVariant: copy.variant === "variant_a" ? "variant_a" : "control",
      };

      if (deferAsync) {
        const { runAtIso } = await enqueueDeferredPaymentLinkEmail(admin, {
          bookingId: bid,
          delaySeconds: delaySec,
          emailPayload,
          phone: phone || null,
          waPayload: params.waPayload,
          context: params.context,
        });
        emailDeferredUntilIso = runAtIso;
        trace.push("email_deferred_async_queue");
      }
    }

    if (!emailDeferredUntilIso && admin && bid && params.userId?.trim()) {
      await applySendDelayIfNeeded(
        admin,
        params.userId.trim(),
        "payment_link",
        undefined,
        params.emailPayload.amountZar != null && Number.isFinite(params.emailPayload.amountZar)
          ? params.emailPayload.amountZar
          : undefined,
      );
    }

    if (!emailDeferredUntilIso) {
      const em = await sendPaymentLinkEmail(emailPayload);
      emailOk = em.sent;
      if (em.sent) {
        primaryChannel = "email";
        trace.push("email_sent");
        emailOutcome = "sent";
      } else {
        trace.push("email_failed");
        emailOutcome = "failed";
        await logSystemEvent({
          level: "warn",
          source: "admin_payment_link_delivery",
          message: "email_failed_try_sms_if_phone",
          context: { ...params.context, step: "payment_link" },
        });
      }
    } else {
      emailOk = false;
      emailOutcome = "skipped";
      trace.push("email_queued_async");
    }
  } else {
    trace.push("no_email");
  }

  const emailResolved = Boolean(emailOk) || Boolean(emailDeferredUntilIso);
  let needSms = Boolean(phone) && (!email || !emailResolved);
  if (params.skipSms) {
    needSms = false;
    trace.push("sms_skipped_admin_request");
  }
  let smsDeliveryRole: SmsDeliveryRole = "none";
  let twilioSmsSid: string | null = null;

  if (needSms) {
    smsDeliveryRole = email && !emailResolved ? "fallback" : "primary";
    const order = normalizePhoneTryOrder(params.phoneTryOrder?.length ? params.phoneTryOrder : ["whatsapp", "sms"]);
    let phoneDelivered = false;

    for (const step of order) {
      if (phoneDelivered) break;
      if (step === "whatsapp") {
        trace.push("whatsapp_skipped_customer_policy");
        continue;
      }

      const linkSmsRole: SmsRole = email && !emailResolved ? "fallback" : "primary";
      const sms = await sendCustomerSmsPaymentLink({
        phone,
        payload: params.waPayload,
        context: params.context,
        smsRole: linkSmsRole,
      });
      smsOk = sms.ok;
      if (sms.twilioSid) twilioSmsSid = sms.twilioSid;
      if (sms.ok) {
        phoneDelivered = true;
        if (primaryChannel === "none") primaryChannel = "sms";
        trace.push(smsDeliveryRole === "fallback" ? "sms_ok_fallback" : "sms_ok_primary");
      } else {
        trace.push("sms_failed");
        await logSystemEvent({
          level: "warn",
          source: "admin_payment_link_delivery",
          message: "sms_failed",
          context: { ...params.context, step: "payment_link", sms_delivery_role: smsDeliveryRole },
        });
      }
    }
  } else if (phone) {
    trace.push(emailDeferredUntilIso ? "sms_skipped_email_deferred_async" : "sms_skipped_email_ok");
  } else {
    trace.push("no_phone");
  }

  const byChannel = {
    whatsapp: (whatsappOk === null ? "skipped" : whatsappOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
    sms: (smsOk === null ? "skipped" : smsOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
    email: (emailOk === null ? "skipped" : emailOk ? "sent" : "failed") as PaymentLinkChannelOutcome,
  };

  const delivery = buildDeliveryTrace(emailOutcome, byChannel.sms, smsDeliveryRole);

  await logSystemEvent({
    level: "info",
    source: "admin_payment_link_delivery",
    message: "payment_link_delivery_complete",
    context: {
      ...params.context,
      step: "payment_link",
      delivery,
      sms_delivery_role: smsDeliveryRole,
      legacy_notification_mode: params.mode,
      fallback_trace: trace.join(","),
      email_deferred_until: emailDeferredUntilIso ?? undefined,
    },
  });

  return {
    whatsappOk,
    smsOk,
    emailOk,
    twilioSmsSid,
    primaryChannel,
    fallbackTrace: trace.join(","),
    byChannel,
    smsDeliveryRole,
    delivery,
    emailDeferredUntilIso: emailDeferredUntilIso ?? undefined,
  };
}
