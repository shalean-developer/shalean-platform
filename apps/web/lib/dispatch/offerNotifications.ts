import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { isWhatsappOutboundPaused } from "@/lib/notifications/notificationRuntimeFlags";

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

function buildOfferMessage(params: {
  offerId: string;
  location: string;
  timeText: string;
  priceText: string;
}): string {
  return [
    "🧹 New Cleaning Job Available",
    "",
    `📍 Location: ${params.location}`,
    `🕒 Time: ${params.timeText}`,
    `💰 Pay: ${params.priceText}`,
    "",
    "You have 60 seconds to accept.",
    "",
    "Reply:",
    "1 -> Accept",
    "2 -> Decline",
    "",
    `Offer ID: ${params.offerId}`,
  ].join("\n");
}

/**
 * Meta Cloud API text send (digits-only `to`, no `+`).
 * Treats HTTP 200 with Graph `error` object or per-message `errors` as failure (not merely "queued").
 * Exported for admin retry of logged deliveries.
 */
export async function sendViaMetaWhatsApp(params: { phone: string; message: string }): Promise<{ messageId: string }> {
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.phone,
      type: "text",
      text: { body: params.message },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const rawText = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${rawText.slice(0, 1200)}`);
  }
  if (json && typeof json.error === "object" && json.error !== null) {
    const err = json.error as { message?: string; code?: number };
    throw new Error(`Meta API error: ${err.message ?? JSON.stringify(json.error)}`);
  }
  const messages = Array.isArray(json?.messages) ? (json!.messages as unknown[]) : [];
  const first = (messages[0] ?? null) as Record<string, unknown> | null;
  if (!first || typeof first.id !== "string" || !first.id.trim()) {
    throw new Error(`Meta API: missing message id in success response: ${rawText.slice(0, 800)}`);
  }
  const nestedErrs = first.errors;
  if (Array.isArray(nestedErrs) && nestedErrs.length) {
    throw new Error(`Meta message errors: ${JSON.stringify(nestedErrs).slice(0, 800)}`);
  }
  return { messageId: first.id.trim() };
}

async function sendWhatsAppText(params: {
  cleanerPhone: string;
  source: string;
  context: Record<string, unknown>;
  message: string;
}): Promise<void> {
  const phone = normalizePhone(params.cleanerPhone);
  if (!phone) {
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_missing_phone`,
      message: "Cleaner has no phone_number configured",
      context: params.context,
    });
    return;
  }

  const devMode = process.env.WHATSAPP_DEV_MODE === "true" || !process.env.WHATSAPP_API_TOKEN;
  if (devMode) {
    console.log("[whatsapp:dev]", { to: phone, message: params.message, ...params.context });
    await logSystemEvent({
      level: "info",
      source: `${params.source}_dev_sent`,
      message: "WhatsApp dev-mode message logged",
      context: { to: phone, ...params.context },
    });
    return;
  }

  await sendViaMetaWhatsApp({ phone, message: params.message });
  await logSystemEvent({
    level: "info",
    source: `${params.source}_sent`,
    message: "WhatsApp message sent",
    context: { to: phone, ...params.context },
  });
}

export async function sendWhatsAppOffer(params: {
  cleanerPhone: string;
  bookingId: string;
  offerId: string;
  time: string;
  location: string;
  price: string;
}): Promise<void> {
  const message = buildOfferMessage({
    offerId: params.offerId,
    location: params.location,
    timeText: params.time,
    priceText: params.price,
  });
  await sendWhatsAppText({
    cleanerPhone: params.cleanerPhone,
    source: "whatsapp_offer",
    context: { bookingId: params.bookingId, offerId: params.offerId },
    message,
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
    await sendWhatsAppOffer({
      cleanerPhone: phone,
      bookingId: params.bookingId,
      offerId: params.offerId,
      time: timeText,
      location,
      price,
    });
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
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: cleaner } = await admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle();
  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const message = [
    "✅ Job accepted.",
    "You have been assigned this booking.",
    "",
    `Booking ID: ${params.bookingId}`,
    `Offer ID: ${params.offerId}`,
  ].join("\n");
  await sendWhatsAppText({
    cleanerPhone: phone,
    source: "whatsapp_offer_accept_confirmation",
    context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    message,
  });
}

export async function notifyCleanerOfferDeclined(params: {
  cleanerId: string;
  bookingId: string;
  offerId: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: cleaner } = await admin.from("cleaners").select("phone_number").eq("id", params.cleanerId).maybeSingle();
  const phone = String((cleaner as { phone_number?: string | null } | null)?.phone_number ?? "");
  const message = [
    "✋ Offer declined.",
    "No action needed. We will offer this booking to another cleaner.",
    "",
    `Offer ID: ${params.offerId}`,
  ].join("\n");
  await sendWhatsAppText({
    cleanerPhone: phone,
    source: "whatsapp_offer_decline_confirmation",
    context: { bookingId: params.bookingId, offerId: params.offerId, cleanerId: params.cleanerId },
    message,
  });
}

export async function sendCleanerOnboardingWhatsApp(params: {
  cleanerPhone: string;
  cleanerId?: string;
}): Promise<void> {
  const message = [
    "Welcome to Shalean 👋",
    "",
    "You will receive cleaning jobs here.",
    "Reply 1 to accept, 2 to decline.",
  ].join("\n");
  await sendWhatsAppText({
    cleanerPhone: params.cleanerPhone,
    source: "whatsapp_cleaner_onboarding",
    context: { cleanerId: params.cleanerId ?? "unknown" },
    message,
  });
}

export async function sendCleanerApprovedWhatsApp(params: {
  cleanerPhone: string;
  cleanerId?: string;
}): Promise<void> {
  const message = ["You're approved 🎉", "You will now start receiving cleaning jobs."].join("\n");
  await sendWhatsAppText({
    cleanerPhone: params.cleanerPhone,
    source: "whatsapp_cleaner_approved",
    context: { cleanerId: params.cleanerId ?? "unknown" },
    message,
  });
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
  const devMode = process.env.WHATSAPP_DEV_MODE === "true" || !process.env.WHATSAPP_API_TOKEN;
  if (devMode) {
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
  try {
    await sendViaMetaWhatsApp({ phone, message: params.message });
    await logSystemEvent({
      level: "info",
      source: `${params.source}_sent`,
      message: "WhatsApp message sent",
      context: { to: phone, ...params.context },
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSystemEvent({
      level: "warn",
      source: `${params.source}_failed`,
      message: msg,
      context: { to: phone, ...params.context },
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
}
