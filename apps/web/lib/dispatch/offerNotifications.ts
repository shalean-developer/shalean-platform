import { format, isValid, parseISO } from "date-fns";
import {
  metaWhatsAppToDigits,
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { isWhatsappOutboundPaused } from "@/lib/notifications/notificationRuntimeFlags";
import { sendSms } from "@/lib/twilioSend";
import { getOfferSmsLinkBaseUrl } from "@/lib/dispatch/offerLinkBaseUrl";
import { isValidOfferTokenFormat } from "@/lib/dispatch/offerByToken";
import {
  assertTemplateSegmentBudget,
  buildBookingOfferBodyParameters,
  formatCleanerPayZarLabel,
  type CleanerWhatsappProductKey,
  resolveMetaTemplateName,
} from "@/lib/whatsapp/cleanerWhatsappTemplates";

export { sendViaMetaWhatsApp };

type NotifyParams = {
  bookingId: string;
  offerId: string;
  cleanerId: string;
  expiresAtIso: string;
  offerToken: string;
};

function normalizePhone(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/[^\d+]/g, "");
}

type OneVarProduct = Extract<CleanerWhatsappProductKey, "offer_ack" | "cleaner_welcome" | "cleaner_approved">;

/** Single body variable `{{1}}` — for ack / onboarding (Meta template must match). */
async function sendCleanerWhatsappTemplateOneVar(params: {
  cleanerPhone: string;
  productKey: OneVarProduct;
  line: string;
  bookingId?: string;
  cleanerId?: string | null;
  source: string;
}): Promise<void> {
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
    await logSystemEvent({
      level: "warn",
      source: params.source,
      message: "Missing cleaner phone for template send",
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, productKey: params.productKey },
    });
    return;
  }
  const templateName = resolveMetaTemplateName(params.productKey);
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
  const r = await sendViaMetaWhatsAppTemplateBody({
    phone: params.cleanerPhone,
    templateName,
    languageCode,
    bodyParameters: [params.line.slice(0, 1020)],
    recipientRole: "cleaner",
    deliveryLog:
      params.bookingId != null && params.bookingId !== ""
        ? {
            bookingId: params.bookingId,
            cleanerId: params.cleanerId ?? null,
            templateForLog: params.productKey,
            messageType: "template",
          }
        : undefined,
  });
  if (!r.ok) {
    await logSystemEvent({
      level: "warn",
      source: params.source,
      message: r.error?.slice(0, 2000) ?? "template send failed",
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, template: params.productKey },
    });
  } else {
    await logSystemEvent({
      level: "info",
      source: params.source,
      message: "WhatsApp template sent",
      context: {
        template: params.productKey,
        meta_template_name: templateName,
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        message_id: r.messageId,
      },
    });
  }
}

const OFFER_TEMPLATE_DATE_MAX = 30;
const OFFER_TEMPLATE_TIME_MAX = 30;
const OFFER_TEMPLATE_LOCATION_MAX = 60;

function formatOfferTemplateDate(raw: string): string {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (d || "Scheduled date").slice(0, OFFER_TEMPLATE_DATE_MAX);
  const dt = parseISO(d);
  if (!isValid(dt)) return d.slice(0, OFFER_TEMPLATE_DATE_MAX);
  return format(dt, "d MMMM yyyy").slice(0, OFFER_TEMPLATE_DATE_MAX);
}

function formatOfferTemplateTime(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return (t || "Scheduled time").slice(0, OFFER_TEMPLATE_TIME_MAX);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return t.slice(0, OFFER_TEMPLATE_TIME_MAX);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hh = String(h12).padStart(2, "0");
  const mm = String(mi).padStart(2, "0");
  return `${hh}:${mm} ${ampm}`.slice(0, OFFER_TEMPLATE_TIME_MAX);
}

function formatOfferTemplateLocationPrimary(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "TBD";
  const primary = s.split(",")[0]?.trim() ?? s;
  return primary.slice(0, OFFER_TEMPLATE_LOCATION_MAX);
}

/**
 * Sends dispatch-offer WhatsApp via template `booking_offer` (exactly 5 body variables: name, location, date, time, pay).
 */
export type SendWhatsAppOfferResult =
  | { ok: true; messageId: string }
  | { ok: false; messageId?: undefined; error?: string };

function cleanerPhoneToE164ForSms(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  const e164 = customerPhoneToE164(d.startsWith("27") ? `+${d}` : d.length === 9 ? `0${d}` : `+${d}`);
  return e164?.trim() || null;
}

export async function sendWhatsAppOffer(params: {
  cleanerPhone: string;
  bookingId: string;
  offerId: string;
  cleanerId: string;
  cleanerName: string;
  bookingDate: string;
  bookingTime: string;
  location: string;
  /** Payment line e.g. `R450` — from {@link formatCleanerPayZarLabel}. */
  payLabel: string;
}): Promise<SendWhatsAppOfferResult> {
  console.log("STEP 4: sendWhatsAppOffer about to run", {
    cleanerId: params.cleanerId,
    bookingId: params.bookingId,
    offerId: params.offerId,
  });
  console.log("🔥 sendWhatsAppOffer CALLED", {
    phone: normalizePhone(params.cleanerPhone),
    bookingId: params.bookingId,
    params: {
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      cleanerName: params.cleanerName,
      bookingDate: params.bookingDate,
      bookingTime: params.bookingTime,
      location: params.location,
      payLabel: params.payLabel,
    },
  });
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
    console.warn("❌ WhatsApp BLOCKED", {
      reason: "missing_phone",
      cleanerId: params.cleanerId,
      decisionObject: { stage: "sendWhatsAppOffer", offerId: params.offerId, bookingId: params.bookingId },
    });
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_missing_phone",
      message: "Cleaner has no phone_number configured",
      context: { bookingId: params.bookingId, offerId: params.offerId },
    });
    return { ok: false, error: "missing_phone" };
  }

  const paused = await isWhatsappOutboundPaused();
  if (paused.paused) {
    console.warn("❌ WhatsApp BLOCKED", {
      reason: "whatsapp_outbound_paused",
      cleanerId: params.cleanerId,
      decisionObject: { untilIso: paused.untilIso, bookingId: params.bookingId, offerId: params.offerId },
    });
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_channel_paused",
      message: "WhatsApp outbound paused — dispatch offer template skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId, untilIso: paused.untilIso },
    });
    return { ok: false, error: `whatsapp_paused:${paused.untilIso ?? ""}` };
  }

  const templateName = resolveMetaTemplateName("booking_offer");
  const languageCode =
    process.env.WHATSAPP_CLEANER_JOB_OFFER_LANG?.trim() ||
    process.env.WHATSAPP_TEMPLATE_BOOKING_OFFER_LANG?.trim() ||
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() ||
    "en";

  const bodyParameters = buildBookingOfferBodyParameters({
    cleanerName: params.cleanerName,
    location: params.location,
    date: params.bookingDate.trim().slice(0, OFFER_TEMPLATE_DATE_MAX),
    time: params.bookingTime.trim().slice(0, OFFER_TEMPLATE_TIME_MAX),
    pay: params.payLabel,
  });
  assertTemplateSegmentBudget(bodyParameters, "booking_offer");

  const sendResult = await sendViaMetaWhatsAppTemplateBody({
    phone: params.cleanerPhone,
    templateName,
    languageCode,
    bodyParameters,
    recipientRole: "cleaner",
    deliveryLog: {
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      templateForLog: "booking_offer",
      messageType: "template",
    },
  });
  if (!sendResult.ok) {
    console.warn("❌ WhatsApp BLOCKED", {
      reason: sendResult.error ?? "meta_template_send_failed",
      cleanerId: params.cleanerId,
      decisionObject: { stage: "sendWhatsAppOffer_meta", bookingId: params.bookingId, offerId: params.offerId },
    });
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_template_send_failed",
      message: sendResult.error?.slice(0, 2000) ?? "WhatsApp offer template send failed",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
    return { ok: false, error: sendResult.error };
  }
  const messageId = sendResult.messageId!;

  const recipientDigits = metaWhatsAppToDigits(params.cleanerPhone);
  await writeNotificationLog({
    booking_id: params.bookingId,
    channel: "whatsapp",
    template_key: "booking_offer",
    recipient: recipientDigits || phone.slice(0, 64),
    status: "sent",
    error: null,
    provider: "meta",
    role: "cleaner",
    event_type: "dispatch_offer",
    payload: {
      source: "whatsapp_offer",
      offerId: params.offerId,
      template: "booking_offer",
      meta_template_name: templateName,
      message_id: messageId,
      body_parameters: bodyParameters,
      cleaner_id: params.cleanerId,
    },
  });

  await logSystemEvent({
    level: "info",
    source: "whatsapp_offer_template_sent",
    message: "Dispatch offer WhatsApp template sent",
    context: {
      bookingId: params.bookingId,
      offerId: params.offerId,
      template: "booking_offer",
      meta_template_name: templateName,
      message_id: messageId,
      cleanerId: params.cleanerId,
    },
  });

  return { ok: true, messageId };
}

/**
 * Outbound dispatch offer: SMS with signed link (no WhatsApp reply flow).
 */
export async function notifyCleanerOfDispatchOffer(params: NotifyParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sms_notify",
      message: "Supabase admin unavailable — offer SMS skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
    return;
  }

  const offerToken = String(params.offerToken ?? "").trim();
  if (!offerToken || !isValidOfferTokenFormat(offerToken)) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_invalid_token",
      message: "Missing or invalid offer_token — SMS skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
    return;
  }

  const [{ data: cleaner }, { data: booking }] = await Promise.all([
    admin.from("cleaners").select("phone_number, full_name").eq("id", params.cleanerId).maybeSingle(),
    admin
      .from("bookings")
      .select("id, location, date, time, total_paid_zar, amount_paid_cents")
      .eq("id", params.bookingId)
      .maybeSingle(),
  ]);

  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const cleanerName =
    String((cleaner as { full_name?: string | null } | null)?.full_name ?? "").trim() || "Cleaner";
  const locationRaw = String((booking as { location?: string | null } | null)?.location ?? "");
  const location = formatOfferTemplateLocationPrimary(locationRaw);
  const date = String((booking as { date?: string | null } | null)?.date ?? "");
  const time = String((booking as { time?: string | null } | null)?.time ?? "").trim();
  const timeHm = time.length >= 5 ? time.slice(0, 5) : time;
  const bookingDate = formatOfferTemplateDate(date);
  const bookingTime = formatOfferTemplateTime(timeHm);
  const payLabel = formatCleanerPayZarLabel(
    (booking as { total_paid_zar?: unknown; amount_paid_cents?: unknown }) ?? {},
  );

  const e164 = cleanerPhoneToE164ForSms(phone);
  if (!e164) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sms_missing_phone",
      message: "Cleaner phone not usable for SMS",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
    return;
  }

  const link = `${getOfferSmsLinkBaseUrl()}/offer/${offerToken}`;
  const message = [
    "New cleaning job:",
    "",
    `📍 ${location}`,
    `📅 ${bookingDate} ${bookingTime}`,
    `💰 ${payLabel}`,
    "",
    "View & accept:",
    link,
  ].join("\n");

  try {
    const sent = await sendSms({ toPhone: e164, message });
    if (sent.ok) {
      const sentAt = new Date().toISOString();
      const { error: mapErr } = await admin
        .from("dispatch_offers")
        .update({ sms_sent_at: sentAt })
        .eq("id", params.offerId)
        .eq("status", "pending");
      if (mapErr) {
        await logSystemEvent({
          level: "warn",
          source: "dispatch_offer_sms_sent_at_persist",
          message: mapErr.message,
          context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
        });
      }
      await writeNotificationLog({
        booking_id: params.bookingId,
        channel: "sms",
        template_key: "dispatch_offer_link",
        recipient: e164.slice(0, 64),
        status: "sent",
        error: null,
        provider: "twilio",
        role: "cleaner",
        event_type: "dispatch_offer",
        payload: {
          source: "dispatch_offer_sms",
          offerId: params.offerId,
          cleaner_id: params.cleanerId,
          twilio_sid: sent.sid,
        },
      });
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_sms_sent",
        message: "Dispatch offer SMS sent",
        context: {
          bookingId: params.bookingId,
          offerId: params.offerId,
          cleanerId: params.cleanerId,
          cleanerName,
        },
      });
    } else {
      await writeNotificationLog({
        booking_id: params.bookingId,
        channel: "sms",
        template_key: "dispatch_offer_link",
        recipient: e164.slice(0, 64),
        status: "failed",
        error: sent.error.slice(0, 2000),
        provider: "twilio",
        role: "cleaner",
        event_type: "dispatch_offer",
        payload: { source: "dispatch_offer_sms", offerId: params.offerId, cleaner_id: params.cleanerId },
      });
      await logSystemEvent({
        level: "warn",
        source: "dispatch_offer_sms_failed",
        message: sent.error.slice(0, 500),
        context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeNotificationLog({
      booking_id: params.bookingId,
      channel: "sms",
      template_key: "dispatch_offer_link",
      recipient: e164.slice(0, 64),
      status: "failed",
      error: msg.slice(0, 2000),
      provider: "twilio",
      role: "cleaner",
      event_type: "dispatch_offer",
      payload: { source: "dispatch_offer_sms", offerId: params.offerId, cleaner_id: params.cleanerId },
    });
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sms_exception",
      message: msg,
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }
}

export async function notifyCleanerOfferAccepted(params: {
  cleanerId: string;
  bookingId: string;
  offerId: string;
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    const { data: cleaner } = await admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle();
    const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
    const message = [
      "✅ You accepted the job.",
      "It is now listed under My Jobs in the cleaner app.",
      "",
      `Booking ID: ${params.bookingId}`,
      `Offer ID: ${params.offerId}`,
    ].join("\n");
    await sendCleanerWhatsappTemplateOneVar({
      cleanerPhone: phone,
      productKey: "offer_ack",
      line: message,
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      source: "whatsapp_offer_accept_confirmation",
    });
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_accept_confirmation_error",
      message: e instanceof Error ? e.message : String(e),
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }
}

/** WhatsApp ack when accept lost the race (booking already assigned to someone else). */
export async function notifyCleanerJobAlreadyTaken(params: {
  cleanerId: string;
  bookingId?: string;
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    const { data: cleaner } = await admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle();
    const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
    const line = "That job was already taken by another cleaner. No action needed — thanks for responding quickly.";
    await sendCleanerWhatsappTemplateOneVar({
      cleanerPhone: phone,
      productKey: "offer_ack",
      line,
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      source: "whatsapp_offer_job_already_taken",
    });
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_job_already_taken_error",
      message: e instanceof Error ? e.message : String(e),
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
    });
  }
}

export async function notifyCleanerOfferDeclined(params: {
  cleanerId: string;
  bookingId: string;
  offerId: string;
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    const { data: cleaner } = await admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle();
    const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
    const message = [
      "✋ You declined this available job.",
      "No action needed — we will offer this booking to another cleaner.",
      "",
      `Offer ID: ${params.offerId}`,
    ].join("\n");
    await sendCleanerWhatsappTemplateOneVar({
      cleanerPhone: phone,
      productKey: "offer_ack",
      line: message,
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      source: "whatsapp_offer_decline_confirmation",
    });
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_decline_confirmation_error",
      message: e instanceof Error ? e.message : String(e),
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }
}

export async function sendCleanerOnboardingWhatsApp(params: {
  cleanerPhone: string;
  cleanerId?: string;
}): Promise<void> {
  try {
    const message = [
      "Welcome to Shalean 👋",
      "",
      "You will receive available jobs and team assignments here.",
      "Reply 1 to accept, 2 to decline.",
    ].join("\n");
    await sendCleanerWhatsappTemplateOneVar({
      cleanerPhone: params.cleanerPhone,
      productKey: "cleaner_welcome",
      line: message,
      bookingId: undefined,
      cleanerId: params.cleanerId,
      source: "whatsapp_cleaner_onboarding",
    });
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_cleaner_onboarding_error",
      message: e instanceof Error ? e.message : String(e),
      context: { cleanerId: params.cleanerId ?? "unknown" },
    });
  }
}

export async function sendCleanerApprovedWhatsApp(params: {
  cleanerPhone: string;
  cleanerId?: string;
}): Promise<void> {
  try {
    const message = ["You're approved 🎉", "You will now start receiving cleaning jobs."].join("\n");
    await sendCleanerWhatsappTemplateOneVar({
      cleanerPhone: params.cleanerPhone,
      productKey: "cleaner_approved",
      line: message,
      bookingId: undefined,
      cleanerId: params.cleanerId,
      source: "whatsapp_cleaner_approved",
    });
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_cleaner_approved_error",
      message: e instanceof Error ? e.message : String(e),
      context: { cleanerId: params.cleanerId ?? "unknown" },
    });
  }
}

