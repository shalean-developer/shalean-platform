import { format, isValid, parseISO } from "date-fns";
import {
  metaWhatsAppToDigits,
  resolveWhatsAppBearerToken,
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { isWhatsappOutboundPaused } from "@/lib/notifications/notificationRuntimeFlags";
import { abortWhatsAppQueueJob, enqueueWhatsApp, flushWhatsAppJobById } from "@/lib/whatsapp/queue";

export { sendViaMetaWhatsApp };

function bookingIdFromContext(ctx: Record<string, unknown>): string | null {
  const b = ctx.bookingId;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

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

const CLEANER_JOB_OFFER_TEMPLATE_DEFAULT = "cleaner_job_offer";
const OFFER_TEMPLATE_SERVICE_MAX = 60;
const OFFER_TEMPLATE_DATE_MAX = 30;
const OFFER_TEMPLATE_TIME_MAX = 30;
const OFFER_TEMPLATE_LOCATION_MAX = 60;

/** Aligns with `cleaner_job_assigned` display helpers for Meta body variables. */
function formatOfferTemplateService(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  let h = Number(m[1]);
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

async function sendWhatsAppText(params: {
  cleanerPhone: string;
  source: string;
  context: Record<string, unknown>;
  message: string;
  idempotencyKey?: string | null;
  /** Higher = worker dequeues sooner (default 0). */
  priority?: number;
}): Promise<string | null> {
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_missing_phone`,
      message: "Cleaner has no phone_number configured",
      context: params.context,
    });
    return null;
  }

  if (process.env.NODE_ENV === "production" && !hasWhatsappMetaConfigured()) {
    await logSystemEvent({
      level: "error",
      source: `${params.source}_prod_misconfig`,
      message: "CRITICAL: WHATSAPP_ACCESS_TOKEN / WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing in production — outbound skipped",
      context: { ...params.context, payload_preview: params.message.slice(0, 120) },
    });
    return null;
  }

  if (isWhatsappDevLogOnly()) {
    console.log("[whatsapp:dev]", { to: phone, message: params.message, ...params.context });
    await logSystemEvent({
      level: "info",
      source: `${params.source}_dev_sent`,
      message: "WhatsApp dev-mode message logged",
      context: { to: phone, ...params.context },
    });
    return null;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_queue_skip`,
      message: "Supabase admin not configured — WhatsApp queue skipped",
      context: params.context,
    });
    return null;
  }

  const enq = await enqueueWhatsApp({
    admin,
    phone,
    phoneRaw: params.cleanerPhone,
    type: "text",
    payload: { kind: "text", text: params.message },
    context: {
      source: params.source,
      ...params.context,
      terminal_sms_in_worker_only: true,
      sms_body: params.message,
    },
    idempotencyKey: params.idempotencyKey ?? null,
    priority: params.priority ?? 0,
  });
  if (enq.id === null) {
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_enqueue_failed`,
      message: enq.error,
      context: { to: phone, ...params.context },
    });
    return null;
  }
  await logSystemEvent({
    level: "info",
    source: `${params.source}_queued`,
    message: "WhatsApp message enqueued for delivery",
    context: { to: phone, queue_id: enq.id, ...params.context },
  });
  return enq.id;
}

/**
 * Sends dispatch-offer WhatsApp via **Meta template only** (`cleaner_job_offer` by default).
 * No text payloads or queue jobs — required for Meta compliance outside the 24h session window.
 */
export async function sendWhatsAppOffer(params: {
  cleanerPhone: string;
  bookingId: string;
  offerId: string;
  cleanerName: string;
  serviceName: string;
  bookingDate: string;
  bookingTime: string;
  location: string;
}): Promise<void> {
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_missing_phone",
      message: "Cleaner has no phone_number configured",
      context: { bookingId: params.bookingId, offerId: params.offerId },
    });
    return;
  }

  const paused = await isWhatsappOutboundPaused();
  if (paused.paused) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_channel_paused",
      message: "WhatsApp outbound paused — dispatch offer template skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId, untilIso: paused.untilIso },
    });
    return;
  }

  if (process.env.NODE_ENV === "production" && !hasWhatsappMetaConfigured()) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_offer_prod_misconfig",
      message: "CRITICAL: Meta WhatsApp credentials missing — dispatch offer template skipped",
      context: { bookingId: params.bookingId, offerId: params.offerId },
    });
    return;
  }

  if (isWhatsappDevLogOnly()) {
    console.log("[whatsapp:offer:template:dev]", {
      to: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerName: params.cleanerName,
      serviceName: params.serviceName,
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
    return;
  }

  const templateName =
    process.env.WHATSAPP_CLEANER_JOB_OFFER_TEMPLATE?.trim() || CLEANER_JOB_OFFER_TEMPLATE_DEFAULT;
  const languageCode =
    process.env.WHATSAPP_CLEANER_JOB_OFFER_LANG?.trim() ||
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() ||
    "en";

  const safeService = (params.serviceName || "Cleaning").trim().slice(0, OFFER_TEMPLATE_SERVICE_MAX);
  const bodyParameters = [
    (params.cleanerName || "Cleaner").trim().slice(0, 60),
    safeService,
    params.bookingDate.trim().slice(0, OFFER_TEMPLATE_DATE_MAX),
    params.bookingTime.trim().slice(0, OFFER_TEMPLATE_TIME_MAX),
    params.location.trim().slice(0, OFFER_TEMPLATE_LOCATION_MAX),
  ];

  const { messageId } = await sendViaMetaWhatsAppTemplateBody({
    phone: params.cleanerPhone,
    templateName,
    languageCode,
    bodyParameters,
  });

  const recipientDigits = metaWhatsAppToDigits(params.cleanerPhone);
  await writeNotificationLog({
    booking_id: params.bookingId,
    channel: "whatsapp",
    template_key: "cleaner_job_offer",
    recipient: recipientDigits || phone.slice(0, 64),
    status: "sent",
    error: null,
    provider: "meta",
    role: "cleaner",
    event_type: "dispatch_offer",
    payload: {
      source: "whatsapp_offer",
      offerId: params.offerId,
      template: templateName,
      message_id: messageId,
      body_parameters: bodyParameters,
    },
  });

  await logSystemEvent({
    level: "info",
    source: "whatsapp_offer_template_sent",
    message: "Dispatch offer WhatsApp template sent",
    context: {
      bookingId: params.bookingId,
      offerId: params.offerId,
      template: templateName,
      message_id: messageId,
    },
  });
}

/**
 * Outbound offer alert hook.
 */
export async function notifyCleanerOfDispatchOffer(params: NotifyParams): Promise<void> {
  console.log("[Offer WhatsApp Triggered]", {
    bookingId: params.bookingId,
    cleanerId: params.cleanerId,
    offerId: params.offerId,
  });
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const [{ data: cleaner }, { data: booking }] = await Promise.all([
    admin.from("cleaners").select("phone_number, full_name").eq("id", params.cleanerId).maybeSingle(),
    admin
      .from("bookings")
      .select("id, location, date, time, service, total_paid_zar, amount_paid_cents")
      .eq("id", params.bookingId)
      .maybeSingle(),
  ]);

  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const cleanerName =
    String((cleaner as { full_name?: string | null } | null)?.full_name ?? "").trim() || "Cleaner";
  const rawService = String((booking as { service?: string | null } | null)?.service ?? "").trim();
  const serviceName = formatOfferTemplateService(rawService) || "Cleaning";
  const locationRaw = String((booking as { location?: string | null } | null)?.location ?? "");
  const location = formatOfferTemplateLocationPrimary(locationRaw);
  const date = String((booking as { date?: string | null } | null)?.date ?? "");
  const time = String((booking as { time?: string | null } | null)?.time ?? "").trim();
  const timeHm = time.length >= 5 ? time.slice(0, 5) : time;
  const bookingDate = formatOfferTemplateDate(date);
  const bookingTime = formatOfferTemplateTime(timeHm);

  const recipientDigits = metaWhatsAppToDigits(phone);

  try {
    await sendWhatsAppOffer({
      cleanerPhone: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerName,
      serviceName,
      bookingDate,
      bookingTime,
      location,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const recipientForLog =
      recipientDigits.length >= 8
        ? recipientDigits
        : phone.trim().slice(0, 64) || `cleaner:${params.cleanerId.slice(0, 8)}`;
    await writeNotificationLog({
      booking_id: params.bookingId,
      channel: "whatsapp",
      template_key: "cleaner_job_offer",
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
    await sendWhatsAppText({
      cleanerPhone: phone,
      source: "whatsapp_offer_accept_confirmation",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
      message,
      idempotencyKey: `offer_accept:${params.bookingId}:${params.offerId}`,
      priority: 60,
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
    await sendWhatsAppText({
      cleanerPhone: phone,
      source: "whatsapp_offer_decline_confirmation",
      context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
      message,
      idempotencyKey: `offer_decline:${params.bookingId}:${params.offerId}`,
      priority: 60,
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
    await sendWhatsAppText({
      cleanerPhone: params.cleanerPhone,
      source: "whatsapp_cleaner_onboarding",
      context: { cleanerId: params.cleanerId ?? "unknown" },
      message,
      idempotencyKey: params.cleanerId
        ? `cleaner_onboard:${params.cleanerId}`
        : `cleaner_onboard_phone:${normalizePhone(params.cleanerPhone).replace(/\D/g, "").slice(-12)}`,
      priority: 10,
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
    await sendWhatsAppText({
      cleanerPhone: params.cleanerPhone,
      source: "whatsapp_cleaner_approved",
      context: { cleanerId: params.cleanerId ?? "unknown" },
      message,
      idempotencyKey: params.cleanerId
        ? `cleaner_approved:${params.cleanerId}`
        : `cleaner_approved_phone:${normalizePhone(params.cleanerPhone).replace(/\D/g, "").slice(-12)}`,
      priority: 10,
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

async function writeCleanerWhatsAppDeliveryLog(params: {
  deliveryLog: { templateKey: string; eventType: string; role: "cleaner" } | undefined;
  context: Record<string, unknown>;
  source: string;
  message: string;
  recipient: string;
  status: "sent" | "failed";
  error: string | null;
}): Promise<void> {
  if (!params.deliveryLog) return;
  const step = params.deliveryLog.eventType;
  await writeNotificationLog({
    booking_id: bookingIdFromContext(params.context),
    channel: "whatsapp",
    template_key: params.deliveryLog.templateKey,
    recipient: params.recipient.slice(0, 64),
    status: params.status,
    error: params.error,
    provider: "meta",
    role: params.deliveryLog.role,
    event_type: params.deliveryLog.eventType,
    payload: { text: params.message, source: params.source, step },
  });
}

/**
 * WhatsApp text to a cleaner phone (Meta Cloud API or dev log). Returns whether Meta send succeeded;
 * missing phone / dev-mode log counts as ok=false with reason for SMS fallback.
 *
 * Pass `deliveryLog` for dispatch/cleaner job flows so attempts appear in `notification_logs`.
 * Customer template sends omit this (they log in `customerOutbound` with template keys).
 */
export async function trySendCleanerWhatsAppMessage(params: {
  cleanerPhone: string;
  message: string;
  source: string;
  context: Record<string, unknown>;
  deliveryLog?: { templateKey: string; eventType: string; role: "cleaner" };
}): Promise<{ ok: boolean; reason?: string }> {
  // DEPRECATED: replaced by triggerWhatsAppNotification (template-based) for job-assigned; still used for e.g. 2h reminders.
  const phone = normalizePhone(params.cleanerPhone);
  const recipientRaw = String(params.cleanerPhone ?? "").trim().slice(0, 64) || "(no_phone)";
  if (!phone) {
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: recipientRaw,
      status: "failed",
      error: "missing_phone",
    });
    return { ok: false, reason: "missing_phone" };
  }
  const paused = await isWhatsappOutboundPaused();
  if (paused.paused) {
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "failed",
      error: "whatsapp_channel_paused",
    });
    return { ok: false, reason: "whatsapp_channel_paused" };
  }

  if (process.env.NODE_ENV === "production" && !hasWhatsappMetaConfigured()) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_prod_misconfig",
      message: "CRITICAL: WhatsApp Meta credentials missing in production — outbound treated as failure",
      context: params.context,
    });
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "failed",
      error: "whatsapp_not_configured",
    });
    return { ok: false, reason: "whatsapp_not_configured" };
  }

  if (isWhatsappDevLogOnly()) {
    await sendWhatsAppText({
      cleanerPhone: params.cleanerPhone,
      source: params.source,
      context: params.context,
      message: params.message,
    });
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "sent",
      error: null,
    });
    return { ok: true };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "failed",
      error: "supabase_admin_not_configured",
    });
    return { ok: false, reason: "supabase_admin_not_configured" };
  }

  const bid = bookingIdFromContext(params.context);
  const idempotencyKey =
    bid != null
      ? `${bid}:${params.source}:${params.deliveryLog?.eventType ?? "cleaner"}`
      : `${params.source}:${phone.replace(/\D/g, "").slice(-12)}`;

  const queuePriority = params.source === "whatsapp_job_reminder_2h" ? 55 : 80;
  const enq = await enqueueWhatsApp({
    admin,
    phone,
    phoneRaw: params.cleanerPhone,
    type: "text",
    payload: { kind: "text", text: params.message },
    context: { source: params.source, ...params.context, skip_terminal_worker_sms: true },
    idempotencyKey,
    priority: queuePriority,
  });
  if (enq.id === null) {
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "failed",
      error: enq.error,
    });
    return { ok: false, reason: enq.error };
  }

  const flush = await flushWhatsAppJobById(admin, enq.id);
  if (!flush.ok) {
    const msg = flush.error ?? "whatsapp_queue_flush_failed";
    await abortWhatsAppQueueJob(admin, enq.id, `sms_fallback_abort:${msg}`);
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_failed`,
      message: msg,
      context: { to: phone, queue_id: enq.id, ...params.context, payload_preview: params.message.slice(0, 200) },
    });
    await writeCleanerWhatsAppDeliveryLog({
      deliveryLog: params.deliveryLog,
      context: params.context,
      source: params.source,
      message: params.message,
      recipient: phone,
      status: "failed",
      error: msg,
    });
    return { ok: false, reason: msg };
  }

  await logSystemEvent({
    level: "info",
    source: `${params.source}_sent`,
    message: "WhatsApp message sent (queue flush)",
    context: { to: phone, queue_id: enq.id, ...params.context },
  });
  await writeCleanerWhatsAppDeliveryLog({
    deliveryLog: params.deliveryLog,
    context: params.context,
    source: params.source,
    message: params.message,
    recipient: phone,
    status: "sent",
    error: null,
  });
  return { ok: true };
}
