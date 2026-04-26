import { resolveWhatsAppBearerToken, sendViaMetaWhatsApp } from "@/lib/dispatch/metaWhatsAppSend";
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

/** Dev-style log-only sends: explicit flag, or local/staging without credentials. Never treats production misconfig as success. */
function isWhatsappDevLogOnly(): boolean {
  if (process.env.WHATSAPP_DEV_MODE === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return !hasWhatsappMetaConfigured();
}

function buildOfferMessage(params: {
  offerId: string;
  location: string;
  timeText: string;
  priceText: string;
}): string {
  return [
    "🧹 Available cleaning job",
    "",
    `📍 Location: ${params.location}`,
    `🕒 Time: ${params.timeText}`,
    `💰 Pay: ${params.priceText}`,
    "",
    "You have 60 seconds to respond.",
    "",
    "Reply:",
    "1 → Accept",
    "2 → Decline",
    "",
    `Offer ID: ${params.offerId}`,
  ].join("\n");
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

export async function sendWhatsAppOffer(params: {
  cleanerPhone: string;
  bookingId: string;
  offerId: string;
  time: string;
  location: string;
  price: string;
}): Promise<string | null> {
  const message = buildOfferMessage({
    offerId: params.offerId,
    location: params.location,
    timeText: params.time,
    priceText: params.price,
  });
  return sendWhatsAppText({
    cleanerPhone: params.cleanerPhone,
    source: "whatsapp_offer",
    context: { bookingId: params.bookingId, offerId: params.offerId },
    message,
    idempotencyKey: `dispatch_offer:${params.bookingId}:${params.offerId}`,
    priority: 100,
  });
}

/**
 * Outbound offer alert hook.
 */
export async function notifyCleanerOfDispatchOffer(params: NotifyParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const [{ data: cleaner }, { data: booking }] = await Promise.all([
    admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle(),
    admin
      .from("bookings")
      .select("id, location, date, time, total_paid_zar, amount_paid_cents")
      .eq("id", params.bookingId)
      .maybeSingle(),
  ]);

  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const location = String((booking as { location?: string | null } | null)?.location ?? "TBD");
  const date = String((booking as { date?: string | null } | null)?.date ?? "");
  const time = String((booking as { time?: string | null } | null)?.time ?? "");
  const amountZar =
    Number((booking as { total_paid_zar?: number | null } | null)?.total_paid_zar ?? 0) ||
    Math.round(Number((booking as { amount_paid_cents?: number | null } | null)?.amount_paid_cents ?? 0) / 100);
  const timeText = [date, time].filter(Boolean).join(" ").trim() || "TBD";
  const price = `R ${Number.isFinite(amountZar) ? amountZar.toLocaleString("en-ZA") : "0"}`;

  try {
    const jobId = await sendWhatsAppOffer({
      cleanerPhone: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      time: timeText,
      location,
      price,
    });
    if (jobId) {
      const { data: preFlushRow } = await admin
        .from("whatsapp_queue")
        .select("status,attempts")
        .eq("id", jobId)
        .maybeSingle();
      const statusBeforeFlush = String((preFlushRow as { status?: string } | null)?.status ?? "unknown");
      const attemptsBeforeFlush = Number((preFlushRow as { attempts?: number } | null)?.attempts ?? 0);

      let flush: Awaited<ReturnType<typeof flushWhatsAppJobById>> = { ok: true };
      try {
        flush = await flushWhatsAppJobById(admin, jobId);
      } catch (e) {
        flush = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!flush.ok) {
        const err = flush.error ?? "unknown_flush_error";
        await logSystemEvent({
          level: "error",
          source: "whatsapp_offer_flush_failed",
          message: err,
          context: {
            job_id: jobId,
            error: err,
            bookingId: params.bookingId,
            offerId: params.offerId,
            cleanerId: params.cleanerId,
            attempts: attemptsBeforeFlush,
            status_before_flush: statusBeforeFlush,
          },
        });
        const jitterMs = Math.random() * 5000;
        const bumpIso = new Date(Date.now() + jitterMs).toISOString();
        await admin
          .from("whatsapp_queue")
          .update({ next_attempt_at: bumpIso, updated_at: bumpIso })
          .eq("id", jobId)
          .eq("status", "pending");
      }
    }
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_offer_send_failed",
      message: e instanceof Error ? e.message : "Unknown WhatsApp send error",
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
