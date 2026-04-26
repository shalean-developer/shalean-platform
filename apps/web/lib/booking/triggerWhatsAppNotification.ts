import "server-only";

import { metaWhatsAppToDigits } from "@/lib/dispatch/metaWhatsAppSend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape after inserting into `public.bookings` (minimal fields for future WhatsApp templates). */
export type CreatedBookingRecord = Record<string, unknown> & {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  location: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  created_at: string;
};

const META_TIMEOUT_MS = 12_000;

type GraphPayload = Record<string, unknown>;

type GraphSendResult = {
  ok: boolean;
  httpStatus: number;
  rawText: string;
  graphMessage?: string;
  graphCode?: number;
  /** Meta `wamid.*` from a successful Graph send response (`messages[0].id`). */
  metaMessageId?: string;
};

function parseGraphJson(rawText: string): Record<string, unknown> {
  try {
    return rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isGraphSendSuccess(res: Response, data: Record<string, unknown>): boolean {
  if (!res.ok) return false;
  if (data.error != null) return false;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const first = (messages[0] ?? null) as Record<string, unknown> | null;
  if (!first || typeof first.id !== "string" || !first.id.trim()) return false;
  const nestedErrs = first.errors;
  if (Array.isArray(nestedErrs) && nestedErrs.length > 0) return false;
  return true;
}

async function postWhatsAppGraphMessage(params: {
  url: string;
  accessToken: string;
  body: GraphPayload;
}): Promise<GraphSendResult> {
  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    const rawText = await res.text();
    const data = parseGraphJson(rawText);
    const err = data.error as { message?: string; code?: number } | undefined;
    const graphMessage = typeof err?.message === "string" ? err.message : undefined;
    const graphCode = typeof err?.code === "number" ? err.code : undefined;
    const ok = isGraphSendSuccess(res, data);
    let metaMessageId: string | undefined;
    if (ok) {
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const first = (messages[0] ?? null) as Record<string, unknown> | null;
      const mid = first?.id;
      if (typeof mid === "string" && mid.trim()) metaMessageId = mid.trim();
    }
    return { ok, httpStatus: res.status, rawText, graphMessage, graphCode, metaMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      httpStatus: 0,
      rawText: "",
      graphMessage: message,
    };
  }
}

/**
 * Meta often blocks plain `text` outside the customer care window; template / re-engagement errors
 * indicate a single template retry is appropriate.
 */
function shouldRetryWithTemplate(result: GraphSendResult): boolean {
  if (result.ok) return false;
  const blob = `${result.graphMessage ?? ""} ${result.graphCode ?? ""} ${result.rawText}`.toLowerCase();
  if (blob.includes("outside") && blob.includes("window")) return true;
  if (blob.includes("24-hour") || blob.includes("24 hour")) return true;
  if (blob.includes("re-engagement") || blob.includes("reengagement")) return true;
  if (blob.includes("131047") || blob.includes("132000") || blob.includes("132001")) return true;
  if (blob.includes("delivery restriction")) return true;
  if (blob.includes("message") && (blob.includes("undeliverable") || blob.includes("not delivered"))) return true;
  if (blob.includes("capability") || blob.includes("not allowed")) return true;
  if (blob.includes("template")) return true;
  return false;
}

function buildTextMessageBody(booking: CreatedBookingRecord): string {
  return `New booking confirmed:
Customer: ${booking.customer_name ?? ""}
Service: ${booking.service ?? ""}
Date: ${booking.date ?? ""}
Time: ${booking.time ?? ""}
Location: ${booking.location ?? ""}`;
}

/** Short human-visible job tag (not parsed for routing); derived from booking UUID. */
export function bookingJobDisplayRef(bookingId: string): string {
  const compact = String(bookingId ?? "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();
  return compact.length >= 6 ? `#${compact}` : `#${String(bookingId).slice(0, 6).toUpperCase()}`;
}

function buildCleanerAssignmentTextBody(booking: CreatedBookingRecord): string {
  const jobTag = bookingJobDisplayRef(booking.id);
  return `New cleaning job assigned:
Job: ${jobTag}
Customer: ${booking.customer_name ?? ""}
Service: ${booking.service ?? ""}
Date: ${booking.date ?? ""}
Time: ${booking.time ?? ""}
Location: ${booking.location ?? ""}

Job ID: ${booking.id}
Reply YES to accept or NO to decline.`;
}

export type TriggerWhatsAppNotificationOptions = {
  /** When set, send to this number instead of `booking.customer_phone`. */
  recipientPhone?: string;
  /** Message copy variant for text + template fallback. */
  variant?: "customer_new_booking" | "cleaner_job_assigned" | "customer_booking_confirmed";
};

function buildCustomerBookingConfirmedBody(): string {
  return "Your booking is confirmed. A cleaner has been assigned.";
}

function buildTextBodyForVariant(
  booking: CreatedBookingRecord,
  variant: TriggerWhatsAppNotificationOptions["variant"],
): string {
  if (variant === "cleaner_job_assigned") return buildCleanerAssignmentTextBody(booking);
  if (variant === "customer_booking_confirmed") return buildCustomerBookingConfirmedBody();
  return buildTextMessageBody(booking);
}

const WHATSAPP_LOG_ERROR_MAX_LEN = 4000;

function formatWhatsappAttemptError(result: GraphSendResult): string {
  const parts: string[] = [];
  if (result.httpStatus > 0) parts.push(`http=${result.httpStatus}`);
  if (result.graphCode != null) parts.push(`code=${result.graphCode}`);
  if (result.graphMessage?.trim()) parts.push(result.graphMessage.trim());
  else if (result.rawText.trim()) parts.push(result.rawText.trim().slice(0, 2000));
  const s = parts.join(" | ").trim();
  return s.slice(0, WHATSAPP_LOG_ERROR_MAX_LEN);
}

/**
 * Persists one delivery attempt row. Never throws; failures are console-only.
 */
async function insertWhatsappLogSafe(
  admin: SupabaseClient | null,
  params: {
    bookingId: string;
    phone: string;
    messageType: "text" | "template";
    result: GraphSendResult;
  },
): Promise<void> {
  if (!admin) return;
  try {
    const status = params.result.ok ? "sent" : "failed";
    const error_message = params.result.ok ? null : formatWhatsappAttemptError(params.result);
    const { error } = await admin.from("whatsapp_logs").insert({
      booking_id: params.bookingId,
      phone: params.phone,
      message_type: params.messageType,
      status,
      error_message,
      meta_message_id: params.result.metaMessageId ?? null,
    });
    if (error) {
      console.error("[triggerWhatsAppNotification] whatsapp_logs insert failed", {
        bookingId: params.bookingId,
        messageType: params.messageType,
        supabaseMessage: error.message,
      });
    }
  } catch (err) {
    console.error("[triggerWhatsAppNotification] whatsapp_logs insert threw", {
      bookingId: params.bookingId,
      messageType: params.messageType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildTemplatePayload(booking: CreatedBookingRecord, toDigits: string, templateName: string): GraphPayload {
  const langCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
  return {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: booking.customer_name || "" },
            { type: "text", text: booking.service || "" },
            { type: "text", text: booking.date || "" },
            { type: "text", text: booking.time || "" },
          ],
        },
      ],
    },
  };
}

/**
 * Sends a transactional WhatsApp text via Meta Cloud API (customer confirmation or cleaner job alert).
 * On session / delivery restriction errors, retries once with an approved template (WHATSAPP_TEMPLATE_NAME).
 * Failures are logged only — callers must not rely on this for persistence.
 */
export async function triggerWhatsAppNotification(
  booking: CreatedBookingRecord,
  options?: TriggerWhatsAppNotificationOptions,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

  if (!phoneNumberId || !accessToken) {
    console.error(
      "[triggerWhatsAppNotification] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN — skipping WhatsApp send",
    );
    return;
  }

  const variant = options?.variant ?? "customer_new_booking";
  const to = metaWhatsAppToDigits(options?.recipientPhone?.trim() || booking.customer_phone || "");
  if (!to) {
    console.error("[triggerWhatsAppNotification] Missing or empty recipient phone — skipping WhatsApp send", {
      bookingId: booking.id,
      variant,
    });
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const textBody = buildTextBodyForVariant(booking, variant);
  const textPayload: GraphPayload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: textBody,
    },
  };

  try {
    const admin = getSupabaseAdmin();

    const textResult = await postWhatsAppGraphMessage({
      url,
      accessToken,
      body: textPayload,
    });

    await insertWhatsappLogSafe(admin, {
      bookingId: booking.id,
      phone: to,
      messageType: "text",
      result: textResult,
    });

    if (textResult.ok) {
      return;
    }

    console.error("[triggerWhatsAppNotification] Meta WhatsApp text message failed", {
      bookingId: booking.id,
      httpStatus: textResult.httpStatus,
      graphMessage: textResult.graphMessage,
      graphCode: textResult.graphCode,
      responsePreview: textResult.rawText.slice(0, 500),
    });

    if (!shouldRetryWithTemplate(textResult)) {
      return;
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
    if (!templateName) {
      console.error(
        "[triggerWhatsAppNotification] Text failed with session/delivery restriction but WHATSAPP_TEMPLATE_NAME is unset — template retry skipped",
        { bookingId: booking.id },
      );
      return;
    }

    const templatePayload = buildTemplatePayload(booking, to, templateName);
    const templateResult = await postWhatsAppGraphMessage({
      url,
      accessToken,
      body: templatePayload,
    });

    await insertWhatsappLogSafe(admin, {
      bookingId: booking.id,
      phone: to,
      messageType: "template",
      result: templateResult,
    });

    if (templateResult.ok) {
      return;
    }

    console.error("[triggerWhatsAppNotification] Template fallback failed after text session error", {
      bookingId: booking.id,
      httpStatus: templateResult.httpStatus,
      graphMessage: templateResult.graphMessage,
      graphCode: templateResult.graphCode,
      responsePreview: templateResult.rawText.slice(0, 500),
      templateName,
    });
  } catch (err) {
    console.error("[triggerWhatsAppNotification] Unexpected error during WhatsApp send", {
      bookingId: booking.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
