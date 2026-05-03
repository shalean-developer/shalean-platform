import type { SupabaseClient } from "@supabase/supabase-js";
import { format, isValid, parseISO } from "date-fns";
import { cleanerJobDeepLinkForSms } from "@/lib/cleaner/cleanerJobMagicLink";
import { sendViaMetaWhatsApp, sendViaMetaWhatsAppTemplateBody } from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { sendSms } from "@/lib/twilioSend";
import { getOfferSmsTrackedUrl } from "@/lib/dispatch/offerLinkBaseUrl";
import { isValidOfferTokenFormat } from "@/lib/dispatch/offerTokenFormat";
import {
  formatCleanerPayZarLabel,
  type CleanerWhatsappProductKey,
  resolveMetaTemplateName,
} from "@/lib/whatsapp/cleanerWhatsappTemplates";
import { metrics } from "@/lib/metrics/counters";

export { sendViaMetaWhatsApp };

const DEFAULT_NOTIFY_MAX_PER_10M = 3;

async function shouldThrottleDispatchOfferNotify(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  cleanerId: string,
): Promise<boolean> {
  const raw = process.env.DISPATCH_OFFER_NOTIFY_MAX_PER_10M?.trim();
  const cap = raw ? Number(raw) : DEFAULT_NOTIFY_MAX_PER_10M;
  const maxPer = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : DEFAULT_NOTIFY_MAX_PER_10M;
  if (maxPer <= 0) return false;

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("cleaner_id", cleanerId)
    .gte("created_at", since);

  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_notify_throttle_query",
      message: error.message,
      context: { cleanerId },
    });
    return false;
  }

  return (count ?? 0) > maxPer;
}

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

const OFFER_TEMPLATE_LOCATION_MAX = 60;

/** Compact date for SMS (e.g. `12 May`). */
function formatOfferSmsDateShort(raw: string): string {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (d || "?").slice(0, 12);
  const dt = parseISO(d);
  if (!isValid(dt)) return d.slice(0, 12);
  return format(dt, "d MMM");
}

/** `HH:MM` 24h for a compact SMS line. */
function formatOfferSmsTimeHm(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t.slice(0, 5) || "?";
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return t.slice(0, 5);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function formatOfferTemplateLocationPrimary(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "TBD";
  const primary = s.split(",")[0]?.trim() ?? s;
  return primary.slice(0, OFFER_TEMPLATE_LOCATION_MAX);
}

function cleanerPhoneToE164ForSms(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  const e164 = customerPhoneToE164(d.startsWith("27") ? `+${d}` : d.length === 9 ? `0${d}` : `+${d}`);
  return e164?.trim() || null;
}

/** SMS when another cleaner won the parallel dispatch race (late accept on offer link). */
export async function notifyCleanerDispatchOfferLostRaceSms(params: {
  supabase: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  offerId: string;
}): Promise<void> {
  const claimed = await tryClaimNotificationIdempotency(params.supabase, {
    reference: `dispatch_offer_lost_race:v1:${params.offerId}`,
    eventType: "dispatch_offer_lost",
    channel: "sms",
    bookingId: params.bookingId,
  });
  if (!claimed) return;

  const { data: cleaner } = await params.supabase
    .from("cleaners")
    .select("phone_number")
    .eq("id", params.cleanerId)
    .maybeSingle();
  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const e164 = cleanerPhoneToE164ForSms(phone);
  if (!e164) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_lost_sms_missing_phone",
      message: "Cleaner phone not usable for lost-race SMS",
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
    });
    return;
  }

  const jobUrl = cleanerJobDeepLinkForSms(params.bookingId, params.cleanerId);
  const body = `Job taken by another cleaner. More work: ${jobUrl}`.slice(0, 280);

  await sendSmsFallback({
    toE164: e164,
    body: body.slice(0, 1200),
    context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
    smsRole: "primary",
    recipientKind: "cleaner",
    deliveryLog: {
      templateKey: "cleaner_dispatch_offer_lost_race_sms",
      bookingId: params.bookingId,
      eventType: "dispatch_offer_lost",
      role: "cleaner",
    },
  });
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

  if (await shouldThrottleDispatchOfferNotify(admin, params.cleanerId)) {
    metrics.increment("dispatch.offer.notify_throttled", { cleanerId: params.cleanerId });
    await logSystemEvent({
      level: "info",
      source: "dispatch_offer_notify_throttled",
      message: "Skipped dispatch offer SMS — cleaner exceeded rolling 10m offer notify budget",
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

  const link = getOfferSmsTrackedUrl(offerToken);
  const dateShort = formatOfferSmsDateShort(date);
  const timeHm24 = formatOfferSmsTimeHm(timeHm);
  const summary = `${dateShort} ${timeHm24} · ${location} · ${payLabel}`.replace(/\s+/g, " ").trim().slice(0, 110);
  const message = `New job: ${summary}\n${link}`.slice(0, 320);

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
      metrics.increment("dispatch.offer.sms_send_ok", { bookingId: params.bookingId, offerId: params.offerId });
      console.log("[OFFER SMS SENT]", params.cleanerId);
    } else {
      metrics.increment("dispatch.offer.sms_send_failed", {
        bookingId: params.bookingId,
        offerId: params.offerId,
        cleanerId: params.cleanerId,
      });
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
    metrics.increment("dispatch.offer.sms_send_failed", {
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerId: params.cleanerId,
      phase: "exception",
    });
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

