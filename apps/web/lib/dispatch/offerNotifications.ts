import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

async function sendViaMetaWhatsApp(params: { phone: string; message: string }): Promise<void> {
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
  }
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
