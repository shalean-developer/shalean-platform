import { format, isValid, parseISO } from "date-fns";
import {
  metaWhatsAppToDigits,
  resolveWhatsAppBearerToken,
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { isWhatsappOutboundPaused } from "@/lib/notifications/notificationRuntimeFlags";
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
};

function normalizePhone(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/[^\d+]/g, "");
}

function hasWhatsappMetaConfigured(): boolean {
  return Boolean(resolveWhatsAppBearerToken() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
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
  if (isWhatsappDevLogOnly()) {
    await logSystemEvent({
      level: "info",
      source: `${params.source}_dev`,
      message: "WhatsApp template (dev log)",
      context: {
        productKey: params.productKey,
        preview: params.line.slice(0, 200),
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
      },
    });
    return;
  }
  if (process.env.NODE_ENV === "production" && !hasWhatsappMetaConfigured()) {
    await logSystemEvent({
      level: "error",
      source: params.source,
      message: "Meta WhatsApp not configured — template send skipped",
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
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

/** Dev-style log-only sends: explicit flag, or local/staging without credentials. Never treats production misconfig as success. */
function isWhatsappDevLogOnly(): boolean {
  if (process.env.WHATSAPP_DEV_MODE === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return !hasWhatsappMetaConfigured();
}

/**
 * Sends dispatch-offer WhatsApp via template `booking_offer` (exactly 5 body variables: name, location, date, time, pay).
 */
export type SendWhatsAppOfferResult =
  | { ok: true; messageId: string }
  | { ok: false; messageId?: undefined; error?: string };

function isDispatchOfferFastSmsEligible(error: string | undefined): boolean {
  if (!error) return false;
  return /circuit|429|rate limit|throttl|80007|130429|too many requests|temporar/i.test(error);
}

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
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
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
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_channel_paused",
      message: "WhatsApp outbound paused — dispatch offer template skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId, untilIso: paused.untilIso },
    });
    return { ok: false, error: `whatsapp_paused:${paused.untilIso ?? ""}` };
  }

  if (process.env.NODE_ENV === "production" && !hasWhatsappMetaConfigured()) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_offer_prod_misconfig",
      message: "CRITICAL: Meta WhatsApp credentials missing — dispatch offer template skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId },
    });
    return { ok: false, error: "meta_whatsapp_not_configured" };
  }

  if (isWhatsappDevLogOnly()) {
    console.log("[whatsapp:offer:template:dev]", {
      to: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerName: params.cleanerName,
      bookingDate: params.bookingDate,
      bookingTime: params.bookingTime,
      location: params.location,
    });
    await logSystemEvent({
      level: "info",
      source: "whatsapp_offer_dev_logged",
      message: "Dispatch offer template (dev mode — not sent to Meta)",
      context: { bookingId: params.bookingId, offerId: params.offerId },
    });
    return { ok: false, error: "whatsapp_dev_log_only" };
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
 * Outbound offer alert hook.
 */
export async function notifyCleanerOfDispatchOffer(params: NotifyParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

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

  const recipientDigits = metaWhatsAppToDigits(phone);

  try {
    const sent = await sendWhatsAppOffer({
      cleanerPhone: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerId: params.cleanerId,
      cleanerName,
      bookingDate,
      bookingTime,
      location,
      payLabel,
    });
    if (sent.ok) {
      const sentAt = new Date().toISOString();
      const { error: mapErr } = await admin
        .from("dispatch_offers")
        .update({
          offer_whatsapp_message_id: sent.messageId,
          whatsapp_sent_at: sentAt,
        })
        .eq("id", params.offerId)
        .eq("status", "pending");
      if (mapErr) {
        await logSystemEvent({
          level: "warn",
          source: "dispatch_offer_whatsapp_id_persist",
          message: mapErr.message,
          context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
        });
      }
    } else if (
      isDispatchOfferFastSmsEligible(sent.error) &&
      String(process.env.DISPATCH_OFFER_SMS_ON_WA_STRESS ?? "1").toLowerCase() !== "0"
    ) {
      const e164 = cleanerPhoneToE164ForSms(phone);
      const body = [
        `Hi ${cleanerName.split(/\s+/)[0] ?? "there"}, new job offer.`,
        `${bookingDate} ${bookingTime} · ${location}.`,
        `Pay ${payLabel}.`,
        "Reply: 1 Accept · 2 Decline.",
        "Open the cleaner app to view and accept.",
      ]
        .join(" ")
        .slice(0, 1200);
      if (e164) {
        const smsRes = await sendSmsFallback({
          toE164: e164,
          body,
          context: {
            source: "dispatch_offer_wa_stress_sms",
            bookingId: params.bookingId,
            offerId: params.offerId,
            cleanerId: params.cleanerId,
            wa_error_hint: (sent.error ?? "").slice(0, 240),
          },
          deliveryLog: {
            templateKey: "booking_offer",
            bookingId: params.bookingId,
            eventType: "dispatch_offer",
            role: "cleaner",
          },
          smsRole: "fallback",
          recipientKind: "cleaner",
        });
        await logSystemEvent({
          level: smsRes.sent ? "info" : "warn",
          source: "dispatch_offer_sms_fallback",
          message: smsRes.sent
            ? "SMS sent after WhatsApp delay/circuit (offer)"
            : `Offer SMS fallback failed: ${smsRes.error ?? "unknown"}`,
          context: {
            bookingId: params.bookingId,
            offerId: params.offerId,
            cleanerId: params.cleanerId,
            sms_sent: smsRes.sent,
          },
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const recipientForLog =
      recipientDigits.length >= 8
        ? recipientDigits
        : phone.trim().slice(0, 64) || `cleaner:${params.cleanerId.slice(0, 8)}`;
    await writeNotificationLog({
      booking_id: params.bookingId,
      channel: "whatsapp",
      template_key: "booking_offer",
      recipient: recipientForLog,
      status: "failed",
      error: msg.slice(0, 2000),
      provider: "meta",
      role: "cleaner",
      event_type: "dispatch_offer",
      payload: { source: "whatsapp_offer", offerId: params.offerId, cleanerId: params.cleanerId },
    });
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_send_failed",
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

