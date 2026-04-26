import "server-only";

import { format, isValid, parseISO } from "date-fns";
import { getWhatsAppGraphApiVersion, metaWhatsAppToDigits, resolveWhatsAppBearerToken } from "@/lib/dispatch/metaWhatsAppSend";
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
    const isTemplate = params.body.type === "template";
    if (isTemplate) {
      if (ok) {
        console.log("[WhatsApp TEMPLATE Response]", data);
      } else {
        console.error("[WhatsApp TEMPLATE Error]", {
          data,
          httpStatus: res.status,
          graphCode: graphCode ?? null,
          graphMessage: graphMessage ?? null,
          rawPreview: rawText.slice(0, 1200),
        });
      }
    } else if (ok) {
      console.log("[WhatsApp Response]", {
        ok: true,
        httpStatus: res.status,
        metaMessageId,
        graphCode: graphCode ?? null,
        graphMessage: graphMessage ?? null,
      });
    } else {
      console.error("[WhatsApp Response]", {
        ok: false,
        httpStatus: res.status,
        graphCode: graphCode ?? null,
        graphMessage: graphMessage ?? null,
        rawPreview: rawText.slice(0, 1200),
      });
    }
    return { ok, httpStatus: res.status, rawText, graphMessage, graphCode, metaMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTemplate = params.body.type === "template";
    if (isTemplate) {
      console.error("[WhatsApp TEMPLATE Error]", { networkOrParse: message });
    }
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

export type TriggerWhatsAppNotificationOptions = {
  /** When set, send to this number instead of `booking.customer_phone`. */
  recipientPhone?: string;
  /**
   * Assigned cleaner display name for Meta template `cleaner_job_assigned` body {{1}}.
   * Should match `cleaners.full_name`; pass from assignment flow when `variant === "cleaner_job_assigned"`.
   */
  cleanerDisplayName?: string;
  /** Message copy variant. `cleaner_job_assigned` is template-only (no session text). */
  variant?: "customer_new_booking" | "cleaner_job_assigned" | "customer_booking_confirmed";
};

function buildCustomerBookingConfirmedBody(): string {
  return "Your booking is confirmed. A cleaner has been assigned.";
}

function buildTextBodyForVariant(
  booking: CreatedBookingRecord,
  variant: "customer_new_booking" | "customer_booking_confirmed",
): string {
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
 * Approved Meta template `cleaner_job_assigned`:
 * {{1}} cleaner, {{2}} service, {{3}} date, {{4}} time, {{5}} location (`booking.location` — primary segment only).
 *
 * In Meta Business Manager, use a **static label** before the variable, e.g. `Location: {{5}}`, not bare `{{5}}`.
 * This file sends **only** the variable value (no "Location:" prefix) so the label is not duplicated.
 *
 * Set `WHATSAPP_CLEANER_JOB_INCLUDE_LOCATION=1` after the Meta template adds body {{5}}.
 */
const CLEANER_JOB_ASSIGNED_TEMPLATE_DEFAULT = "cleaner_job_assigned";

const TEMPLATE_CLEANER_NAME_MAX = 60;
const TEMPLATE_SERVICE_MAX = 60;
const TEMPLATE_DATE_DISPLAY_MAX = 30;
const TEMPLATE_TIME_DISPLAY_MAX = 30;
const TEMPLATE_LOCATION_VALUE_MAX = 60;

const LOCATION_EMPTY_FALLBACK = "Location will be shared after acceptance";

function includeCleanerJobLocationParam(): boolean {
  const v = process.env.WHATSAPP_CLEANER_JOB_INCLUDE_LOCATION?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** First comma-separated segment (street / primary line), max length — easier to scan in WhatsApp. */
function formatCleanerTemplateLocationValue(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const primary = s.split(",")[0]?.trim() ?? "";
  return primary.slice(0, TEMPLATE_LOCATION_VALUE_MAX);
}

/** e.g. `deep_cleaning` → `Deep Cleaning` */
function formatCleanerTemplateService(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `YYYY-MM-DD` → e.g. `28 June 2026`; invalid/empty → trimmed slice fallback. */
function formatCleanerTemplateDate(raw: string): string {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (d || "Scheduled date").slice(0, TEMPLATE_DATE_DISPLAY_MAX);
  const dt = parseISO(d);
  if (!isValid(dt)) return d.slice(0, TEMPLATE_DATE_DISPLAY_MAX);
  return format(dt, "d MMMM yyyy");
}

/** `HH:mm` (24h) → e.g. `09:00 AM`; invalid/empty → trimmed slice fallback. */
function formatCleanerTemplateTime(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return (t || "Scheduled time").slice(0, TEMPLATE_TIME_DISPLAY_MAX);
  let h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return t.slice(0, TEMPLATE_TIME_DISPLAY_MAX);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hh = String(h12).padStart(2, "0");
  const mm = String(mi).padStart(2, "0");
  return `${hh}:${mm} ${ampm}`;
}

function buildCleanerJobAssignedTemplatePayload(
  booking: CreatedBookingRecord,
  toDigits: string,
  assignedCleanerDisplayName: string | undefined,
): GraphPayload {
  const templateName =
    process.env.WHATSAPP_CLEANER_JOB_ASSIGNED_TEMPLATE?.trim() || CLEANER_JOB_ASSIGNED_TEMPLATE_DEFAULT;
  const langCode =
    process.env.WHATSAPP_CLEANER_JOB_ASSIGNED_LANG?.trim() ||
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() ||
    "en";

  const rawCleaner = String(assignedCleanerDisplayName ?? "").trim();
  const cleanerName = rawCleaner || "Cleaner";
  const rawService = String(booking.service ?? "").trim();
  const formattedService = formatCleanerTemplateService(rawService);
  const serviceName = formattedService || "Cleaning";
  const rawDate = String(booking.date ?? "").trim();
  const rawTime = String(booking.time ?? "").trim();
  const rawLocation = String(booking.location ?? "").trim();

  const formattedDate = rawDate ? formatCleanerTemplateDate(rawDate) : "Scheduled date";
  const formattedTime = rawTime ? formatCleanerTemplateTime(rawTime) : "Scheduled time";

  const safeCleanerName = (cleanerName || "Cleaner").trim().slice(0, TEMPLATE_CLEANER_NAME_MAX);
  const safeService = (serviceName || "Cleaning").trim().slice(0, TEMPLATE_SERVICE_MAX);
  const safeDate = (formattedDate || "Scheduled date").trim().slice(0, TEMPLATE_DATE_DISPLAY_MAX);
  const safeTime = (formattedTime || "Scheduled time").trim().slice(0, TEMPLATE_TIME_DISPLAY_MAX);
  const locationPrimary = formatCleanerTemplateLocationValue(rawLocation);
  const safeLocation = locationPrimary || LOCATION_EMPTY_FALLBACK;

  const bodyParameters: Array<{ type: "text"; text: string }> = [
    { type: "text", text: safeCleanerName },
    { type: "text", text: safeService },
    { type: "text", text: safeDate },
    { type: "text", text: safeTime },
  ];
  if (includeCleanerJobLocationParam()) {
    bodyParameters.push({ type: "text", text: safeLocation });
  }

  console.log("[Template Params]", {
    cleanerName: safeCleanerName,
    serviceName: safeService,
    bookingDate: safeDate,
    bookingTime: safeTime,
    ...(includeCleanerJobLocationParam() ? { location: safeLocation } : {}),
  });

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
          parameters: bodyParameters,
        },
      ],
    },
  };
}

/**
 * Sends transactional WhatsApp via Meta Cloud API.
 * **Cleaner job assigned:** sends **only** the approved Meta template `cleaner_job_assigned` ({{1}}–{{4}}; optional {{5}}). No plain `text` sends and no fallback chain — new cleaner conversations require a template.
 * **Customer paths:** text first, then optional `WHATSAPP_TEMPLATE_NAME` template on session errors.
 *
 * @returns `true` if a WhatsApp send succeeded; `false` if skipped or all attempts failed.
 */
export async function triggerWhatsAppNotification(
  booking: CreatedBookingRecord,
  options?: TriggerWhatsAppNotificationOptions,
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = resolveWhatsAppBearerToken();

  if (!phoneNumberId || !accessToken) {
    console.error(
      "[triggerWhatsAppNotification] Missing WHATSAPP_PHONE_NUMBER_ID or bearer token — set WHATSAPP_ACCESS_TOKEN or WHATSAPP_API_TOKEN — skipping WhatsApp send",
    );
    return false;
  }

  const variant = options?.variant ?? "customer_new_booking";
  const to = metaWhatsAppToDigits(options?.recipientPhone?.trim() || booking.customer_phone || "");
  if (!to) {
    console.error("[triggerWhatsAppNotification] Missing or empty recipient phone — skipping WhatsApp send", {
      bookingId: booking.id,
      variant,
    });
    return false;
  }

  const graphVersion = getWhatsAppGraphApiVersion();
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  try {
    const admin = getSupabaseAdmin();

    if (variant === "cleaner_job_assigned") {
      const cleanerTemplatePayload = buildCleanerJobAssignedTemplatePayload(
        booking,
        to,
        options?.cleanerDisplayName,
      );
      const cleanerTemplateResult = await postWhatsAppGraphMessage({
        url,
        accessToken,
        body: cleanerTemplatePayload,
      });
      await insertWhatsappLogSafe(admin, {
        bookingId: booking.id,
        phone: to,
        messageType: "template",
        result: cleanerTemplateResult,
      });
      if (cleanerTemplateResult.ok) {
        return true;
      }
      console.error(
        "[triggerWhatsAppNotification] cleaner_job_assigned template failed (template-only path; no text fallback)",
        {
          bookingId: booking.id,
          httpStatus: cleanerTemplateResult.httpStatus,
          graphMessage: cleanerTemplateResult.graphMessage,
          graphCode: cleanerTemplateResult.graphCode,
        },
      );
      return false;
    }

    const textBody = buildTextBodyForVariant(
      booking,
      variant === "customer_booking_confirmed" ? "customer_booking_confirmed" : "customer_new_booking",
    );
    const textPayload: GraphPayload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: textBody,
      },
    };

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
      return true;
    }

    console.error("[triggerWhatsAppNotification] Meta WhatsApp text message failed", {
      bookingId: booking.id,
      httpStatus: textResult.httpStatus,
      graphMessage: textResult.graphMessage,
      graphCode: textResult.graphCode,
      responsePreview: textResult.rawText.slice(0, 500),
    });

    if (!shouldRetryWithTemplate(textResult)) {
      return false;
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
    if (!templateName) {
      console.error(
        "[triggerWhatsAppNotification] Text failed with session/delivery restriction but WHATSAPP_TEMPLATE_NAME is unset — template retry skipped",
        { bookingId: booking.id },
      );
      return false;
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
      return true;
    }

    console.error("[triggerWhatsAppNotification] Template fallback failed after text session error", {
      bookingId: booking.id,
      httpStatus: templateResult.httpStatus,
      graphMessage: templateResult.graphMessage,
      graphCode: templateResult.graphCode,
      responsePreview: templateResult.rawText.slice(0, 500),
      templateName,
    });
    return false;
  } catch (err) {
    console.error("[triggerWhatsAppNotification] Unexpected error during WhatsApp send", {
      bookingId: booking.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
