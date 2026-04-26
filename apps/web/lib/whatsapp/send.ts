import {
  getWhatsAppGraphApiVersion,
  metaWhatsAppToDigits,
  resolveWhatsAppBearerToken,
} from "@/lib/dispatch/metaWhatsAppSend";
import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Low-level Meta Graph `/{phone-number-id}/messages` POST with a full JSON body.
 * Prefer {@link sendViaMetaWhatsApp} / {@link sendViaMetaWhatsAppTemplateBody} or the queue helpers.
 */
export async function sendWhatsAppGraphPayload(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = resolveWhatsAppBearerToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_API_TOKEN (or WHATSAPP_PHONE_NUMBER_ID)");
  }

  const toRaw = body.to;
  if (typeof toRaw === "string") {
    body = { ...body, to: metaWhatsAppToDigits(toRaw) };
  }

  const graphVersion = getWhatsAppGraphApiVersion();
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  const payloadPreview = JSON.stringify({ ...body, to: typeof body.to === "string" ? `${String(body.to).slice(0, 4)}…` : body.to }).slice(0, 800);

  await logSystemEvent({
    level: "info",
    source: "whatsapp_send",
    message: "WhatsApp Graph raw POST (sendWhatsAppGraphPayload)",
    context: {
      graph_version: graphVersion,
      payload_preview: payloadPreview,
      payload_type: typeof body.type === "string" ? body.type : "unknown",
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const rawText = await res.text();
  let data: Record<string, unknown> & { error?: { message?: string } } = {};
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    data = {};
  }
  if (!res.ok || data.error) {
    const errText =
      typeof data.error === "object" && data.error && "message" in data.error ? String(data.error.message) : rawText.slice(0, 500);
    await logSystemEvent({
      level: "error",
      source: "whatsapp_send",
      message: "WhatsApp Graph raw POST failed",
      context: {
        graph_version: graphVersion,
        response_status: res.status,
        error_preview: errText,
      },
    });
    throw new Error(errText || "WhatsApp send failed");
  }
  await logSystemEvent({
    level: "info",
    source: "whatsapp_send",
    message: "WhatsApp Graph raw POST succeeded",
    context: {
      graph_version: graphVersion,
      response_status: res.status,
      response_preview: rawText.slice(0, 600),
    },
  });
  return data;
}
