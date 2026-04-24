/**
 * Coarse buckets for admin dashboard "provider health" (from `notification_logs.error`).
 */

export type WhatsappFailureBucket =
  | "missing_phone"
  | "channel_paused"
  | "invalid_recipient"
  | "meta_api"
  | "template_not_found"
  | "other";

export type SmsFailureBucket =
  | "twilio_not_configured"
  | "invalid_destination"
  | "twilio_http"
  | "other";

export function bucketWhatsappFailure(error: string | null | undefined): WhatsappFailureBucket {
  const e = String(error ?? "").toLowerCase();
  if (!e) return "other";
  if (e === "missing_phone" || e.includes("missing_phone")) return "missing_phone";
  if (e.includes("whatsapp_channel_paused") || e.includes("channel_paused")) return "channel_paused";
  if (e.includes("template_not_found")) return "template_not_found";
  if (
    e.includes("invalid") &&
    (e.includes("phone") || e.includes("recipient") || e.includes("number") || e.includes("131026"))
  ) {
    return "invalid_recipient";
  }
  if (
    e.includes("meta api") ||
    e.includes("meta message") ||
    e.includes("whatsapp send failed") ||
    e.includes("graph.facebook.com") ||
    /^\d{3,}/.test(e)
  ) {
    return "meta_api";
  }
  return "other";
}

export function bucketSmsFailure(error: string | null | undefined): SmsFailureBucket {
  const e = String(error ?? "");
  if (!e) return "other";
  if (e.includes("twilio_not_configured")) return "twilio_not_configured";
  if (e.includes("invalid_sms") || e.includes("invalid destination")) return "invalid_destination";
  if (e.startsWith("twilio_")) return "twilio_http";
  return "other";
}
