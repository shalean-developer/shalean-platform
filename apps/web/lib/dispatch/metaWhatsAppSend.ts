import { createHmac, timingSafeEqual } from "crypto";

import { metaGraphSendRetryDelayMs } from "@/lib/dispatch/metaSendRetry";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logWhatsAppEvent } from "@/lib/whatsapp/logWhatsAppEvent";
import {
  isMetaSendCircuitOpen,
  recordMetaSendOutcome,
  throttleWhatsAppMetaSend,
} from "@/lib/whatsapp/whatsappMetaSafeguards";

const META_SEND_TIMEOUT_MS = 12_000;
const MAX_SEND_ATTEMPTS = 3;
const WA_BODY_TEMPLATE_MAX = 1024;

/** Graph HTTP statuses worth retrying with backoff (same cap as 429). */
function isMetaTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableMetaFailure(status: number, rawText: string, graphError?: string): boolean {
  if (isMetaTransientHttpStatus(status)) return true;
  const blob = `${graphError ?? ""} ${rawText}`.toLowerCase();
  if (blob.includes("rate limit") || blob.includes("too many") || blob.includes("throttl")) return true;
  if (blob.includes("80007") || blob.includes("130429") || blob.includes('"code":4')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Outbound WhatsApp is restricted to cleaner operations only (enforced at runtime + call sites). */
export type MetaWhatsAppRecipientRole = "cleaner";

export type MetaWhatsAppDeliveryResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/** Optional DB + unified log row for a send (cleaner job / offer, etc.). */
export type MetaWhatsAppDeliveryLogContext = {
  bookingId: string;
  cleanerId?: string | null;
  /** Template name or `"text"` for plain body sends. */
  templateForLog: string;
  messageType: "text" | "template";
};

function assertMetaWhatsAppCleanerOnly(role: MetaWhatsAppRecipientRole): void {
  if (role !== "cleaner") {
    throw new Error("WhatsApp is restricted to cleaners only");
  }
}

/** Meta Cloud API `to` field: digits only, country code included, no `+`. */
export function metaWhatsAppToDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** Graph API version segment (e.g. `v22.0`). Override with `WHATSAPP_GRAPH_API_VERSION` if Meta requires a specific version. */
export function getWhatsAppGraphApiVersion(): string {
  return process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v22.0";
}

/**
 * Permanent system-user token for Cloud API.
 * `WHATSAPP_ACCESS_TOKEN` is preferred (matches Meta dashboard naming); `WHATSAPP_API_TOKEN` is a legacy alias used elsewhere in the repo.
 */
export function resolveWhatsAppBearerToken(): string | undefined {
  const a = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const b = process.env.WHATSAPP_API_TOKEN?.trim();
  return a || b || undefined;
}

function graphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${getWhatsAppGraphApiVersion()}/${phoneNumberId}/messages`;
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type ParsedSuccess = { ok: true; messageId: string };
type ParsedFailure = { ok: false; status: number; rawText: string; graphError?: string };

function parseGraphMessagesResponse(res: Response, rawText: string): ParsedSuccess | ParsedFailure {
  let json: Record<string, unknown> | null = null;
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, rawText };
  }
  if (json && typeof json.error === "object" && json.error !== null) {
    const err = json.error as { message?: string; code?: number };
    const graphError = err.message ?? JSON.stringify(json.error);
    return { ok: false, status: res.status, rawText, graphError };
  }
  const messages = Array.isArray(json?.messages) ? (json!.messages as unknown[]) : [];
  const first = (messages[0] ?? null) as Record<string, unknown> | null;
  if (!first || typeof first.id !== "string" || !first.id.trim()) {
    return { ok: false, status: res.status, rawText, graphError: "missing_message_id" };
  }
  const nestedErrs = first.errors;
  if (Array.isArray(nestedErrs) && nestedErrs.length) {
    return {
      ok: false,
      status: res.status,
      rawText,
      graphError: `nested: ${JSON.stringify(nestedErrs).slice(0, 800)}`,
    };
  }
  return { ok: true, messageId: first.id.trim() };
}

function shouldTryTemplateFallback(graphError: string | undefined, rawText: string): boolean {
  const blob = `${graphError ?? ""} ${rawText}`.toLowerCase();
  if (blob.includes("template")) return true;
  if (blob.includes("re-engagement") || blob.includes("reengagement")) return true;
  if (blob.includes("131047") || blob.includes("132000") || blob.includes("132001")) return true;
  if (blob.includes("outside") && blob.includes("window")) return true;
  return false;
}

async function postMetaMessage(params: {
  token: string;
  phoneNumberId: string;
  body: Record<string, unknown>;
  attempt: number;
}): Promise<{ res: Response; rawText: string }> {
  const res = await fetch(graphMessagesUrl(params.phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
    signal: AbortSignal.timeout(META_SEND_TIMEOUT_MS),
  });
  const rawText = await res.text();
  let parsedPreview: Record<string, unknown> | null = null;
  try {
    parsedPreview = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    parsedPreview = null;
  }
  const graphErr = parsedPreview?.error as { code?: number; message?: string } | undefined;
  const graphBodyError =
    graphErr != null && typeof graphErr === "object" && (graphErr.code != null || Boolean(graphErr.message));
  if (!res.ok || graphBodyError) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_meta_http",
      message: `Meta messages POST failed status=${res.status} attempt=${params.attempt + 1}`,
      context: {
        response_status: res.status,
        attempt: params.attempt + 1,
        payload_type: params.body.type,
        to_digits_tail: String(params.body.to ?? "").slice(-4),
        graph_code: graphErr?.code ?? null,
        error_preview: rawText.slice(0, 280),
      },
    });
  }
  return { res, rawText };
}

/**
 * Sends a utility template with a single body variable (text). Requires an approved Meta template
 * whose body has exactly one {{1}} placeholder. Configure: WHATSAPP_FALLBACK_TEMPLATE_NAME, WHATSAPP_FALLBACK_TEMPLATE_LANG.
 */
async function sendTemplateSingleBodyVar(params: {
  token: string;
  phoneNumberId: string;
  toDigits: string;
  text: string;
  templateName: string;
  langCode: string;
}): Promise<ParsedSuccess | ParsedFailure> {
  const bodyText = params.text.slice(0, WA_BODY_TEMPLATE_MAX);
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: params.toDigits,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.langCode },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: bodyText }],
        },
      ],
    },
  };
  await throttleWhatsAppMetaSend();
  const { res, rawText } = await postMetaMessage({
    token: params.token,
    phoneNumberId: params.phoneNumberId,
    body,
    attempt: 0,
  });
  return parseGraphMessagesResponse(res, rawText);
}

async function emitMetaDeliveryAudit(
  deliveryLog: MetaWhatsAppDeliveryLogContext | undefined,
  toDigits: string,
  out: MetaWhatsAppDeliveryResult,
  messageType: "text" | "template",
): Promise<void> {
  if (!deliveryLog) return;
  await logWhatsAppEvent(null, {
    booking_id: deliveryLog.bookingId,
    cleaner_id: deliveryLog.cleanerId ?? null,
    template: deliveryLog.templateForLog,
    status: out.ok ? "sent" : "failed",
    error: out.ok ? undefined : out.error,
    phone: toDigits,
    message_type: messageType,
    meta_message_id: out.ok ? out.messageId : undefined,
  });
}

/**
 * Meta Cloud API outbound send: digits-only `to`, 429 retries, optional template fallback outside 24h window.
 * `recipientRole` must be `"cleaner"` — customer/admin WhatsApp is not permitted (throws).
 */
export async function sendViaMetaWhatsApp(params: {
  phone: string;
  message: string;
  recipientRole: MetaWhatsAppRecipientRole;
  /** When set, success/failure is written via {@link logWhatsAppEvent} + `whatsapp_logs`. */
  deliveryLog?: MetaWhatsAppDeliveryLogContext;
}): Promise<MetaWhatsAppDeliveryResult> {
  assertMetaWhatsAppCleanerOnly(params.recipientRole);
  const token = resolveWhatsAppBearerToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    const e = "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_API_TOKEN (or WHATSAPP_PHONE_NUMBER_ID)";
    const out: MetaWhatsAppDeliveryResult = { ok: false, error: e };
    await emitMetaDeliveryAudit(
      params.deliveryLog,
      metaWhatsAppToDigits(params.phone),
      out,
      "text",
    );
    return out;
  }

  const toDigits = metaWhatsAppToDigits(params.phone);
  if (toDigits.length < 10 || toDigits.length > 15) {
    const out: MetaWhatsAppDeliveryResult = { ok: false, error: `Invalid WhatsApp recipient digits length=${toDigits.length}` };
    await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "text");
    return out;
  }

  if (isMetaSendCircuitOpen()) {
    const out: MetaWhatsAppDeliveryResult = {
      ok: false,
      error: "Meta WhatsApp send paused (circuit open) — will retry",
    };
    await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "text");
    return out;
  }

  const textBody: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "text",
    text: { body: params.message },
  };

  let lastFailure: ParsedFailure | null = null;

  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    if (attempt > 0 && lastFailure) {
      const re = isRetryableMetaFailure(lastFailure.status, lastFailure.rawText, lastFailure.graphError);
      if (re) {
        await sleep(metaGraphSendRetryDelayMs(attempt - 1));
      }
    }
    await throttleWhatsAppMetaSend();
    if (isMetaSendCircuitOpen()) {
      lastFailure = { ok: false, status: 503, rawText: "circuit_open", graphError: "circuit_open" };
      recordMetaSendOutcome(false);
      break;
    }
    const { res, rawText } = await postMetaMessage({
      token,
      phoneNumberId,
      body: textBody,
      attempt,
    });
    const parsed = parseGraphMessagesResponse(res, rawText);
    if (parsed.ok) {
      recordMetaSendOutcome(true);
      const out: MetaWhatsAppDeliveryResult = { ok: true, messageId: parsed.messageId };
      await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "text");
      return out;
    }
    lastFailure = parsed;
    recordMetaSendOutcome(false);
    const graphErr = !parsed.ok ? parsed.graphError : undefined;
    if (isRetryableMetaFailure(res.status, rawText, graphErr) && attempt < MAX_SEND_ATTEMPTS - 1) {
      continue;
    }
    break;
  }

  const failText = lastFailure?.graphError ?? lastFailure?.rawText ?? "unknown";
  const templateName = process.env.WHATSAPP_FALLBACK_TEMPLATE_NAME?.trim();
  const templateLang = process.env.WHATSAPP_FALLBACK_TEMPLATE_LANG?.trim() || "en";
  const wantsTemplateFallback = shouldTryTemplateFallback(lastFailure?.graphError, lastFailure?.rawText ?? "");

  if (wantsTemplateFallback && !templateName) {
    await logSystemEvent({
      level: "error",
      source: "whatsapp_template_fallback_missing_config",
      message:
        "Text send hit template-only / re-engagement error but WHATSAPP_FALLBACK_TEMPLATE_NAME is unset — cannot fall back.",
      context: {
        to_digits_tail: toDigits.slice(-4),
        preview: failText.slice(0, 400),
      },
    });
  }

  if (templateName && wantsTemplateFallback) {
    const tpl = await sendTemplateSingleBodyVar({
      token,
      phoneNumberId,
      toDigits,
      text: params.message,
      templateName,
      langCode: templateLang,
    });
    if (tpl.ok) {
      recordMetaSendOutcome(true);
      const out: MetaWhatsAppDeliveryResult = { ok: true, messageId: tpl.messageId };
      await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "text");
      return out;
    }
    const tErr = tpl.ok === false ? (tpl.graphError ?? tpl.rawText) : "";
    recordMetaSendOutcome(false);
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_meta_template_fallback_failed",
      message: tErr.slice(0, 500),
      context: { template: templateName, to_digits_tail: toDigits.slice(-4) },
    });
  }

  const errMsg = lastFailure?.graphError
    ? `Meta API error: ${lastFailure.graphError}`
    : `WhatsApp send failed (${lastFailure?.status ?? "?"}): ${(lastFailure?.rawText ?? "").slice(0, 1200)}`;
  await logSystemEvent({
    level: "error",
    source: "whatsapp_meta_send_failed",
    message: errMsg.slice(0, 2000),
    context: {
      to_digits_tail: toDigits.slice(-4),
      response_status: lastFailure?.status,
      text_len: params.message.length,
    },
  });
  const fail: MetaWhatsAppDeliveryResult = { ok: false, error: errMsg };
  await emitMetaDeliveryAudit(params.deliveryLog, toDigits, fail, "text");
  return fail;
}

/**
 * Approved Meta template with N body variables {{1}}..{{N}} — parameters map 1:1 in order.
 * `recipientRole` must be `"cleaner"` — customer/admin WhatsApp is not permitted (throws).
 */
export async function sendViaMetaWhatsAppTemplateBody(params: {
  phone: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
  recipientRole: MetaWhatsAppRecipientRole;
  deliveryLog?: MetaWhatsAppDeliveryLogContext;
}): Promise<MetaWhatsAppDeliveryResult> {
  assertMetaWhatsAppCleanerOnly(params.recipientRole);
  const token = resolveWhatsAppBearerToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    const e = "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_API_TOKEN (or WHATSAPP_PHONE_NUMBER_ID)";
    const out: MetaWhatsAppDeliveryResult = { ok: false, error: e };
    await emitMetaDeliveryAudit(
      params.deliveryLog,
      metaWhatsAppToDigits(params.phone),
      out,
      "template",
    );
    return out;
  }

  const toDigits = metaWhatsAppToDigits(params.phone);
  if (toDigits.length < 10 || toDigits.length > 15) {
    const out: MetaWhatsAppDeliveryResult = { ok: false, error: `Invalid WhatsApp recipient digits length=${toDigits.length}` };
    await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "template");
    return out;
  }

  if (isMetaSendCircuitOpen()) {
    const out: MetaWhatsAppDeliveryResult = {
      ok: false,
      error: "Meta WhatsApp send paused (circuit open) — will retry",
    };
    await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "template");
    return out;
  }

  const parameters = params.bodyParameters.map((t) => ({
    type: "text",
    text: String(t ?? "").slice(0, WA_BODY_TEMPLATE_MAX),
  }));

  const resolvedLang = (params.languageCode || "en").trim();
  const resolvedName = params.templateName.trim();

  const templateBody: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: resolvedName,
      language: { code: resolvedLang },
      components: [{ type: "body", parameters }],
    },
  };

  let lastFailure: ParsedFailure | null = null;

  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    if (attempt > 0 && lastFailure) {
      const re = isRetryableMetaFailure(lastFailure.status, lastFailure.rawText, lastFailure.graphError);
      if (re) {
        await sleep(metaGraphSendRetryDelayMs(attempt - 1));
      }
    }
    await throttleWhatsAppMetaSend();
    if (isMetaSendCircuitOpen()) {
      lastFailure = { ok: false, status: 503, rawText: "circuit_open", graphError: "circuit_open" };
      recordMetaSendOutcome(false);
      break;
    }
    const { res, rawText } = await postMetaMessage({
      token,
      phoneNumberId,
      body: templateBody,
      attempt,
    });
    const parsed = parseGraphMessagesResponse(res, rawText);
    if (parsed.ok) {
      recordMetaSendOutcome(true);
      const out: MetaWhatsAppDeliveryResult = { ok: true, messageId: parsed.messageId };
      await emitMetaDeliveryAudit(params.deliveryLog, toDigits, out, "template");
      return out;
    }
    lastFailure = parsed;
    recordMetaSendOutcome(false);
    const graphErr = !parsed.ok ? parsed.graphError : undefined;
    if (isRetryableMetaFailure(res.status, rawText, graphErr) && attempt < MAX_SEND_ATTEMPTS - 1) {
      continue;
    }
    break;
  }

  const errMsg = lastFailure?.graphError
    ? `Meta API error: ${lastFailure.graphError}`
    : `WhatsApp template send failed (${lastFailure?.status ?? "?"}): ${(lastFailure?.rawText ?? "").slice(0, 1200)}`;
  await logSystemEvent({
    level: "error",
    source: "whatsapp_meta_template_send_failed",
    message: errMsg.slice(0, 2000),
    context: {
      template: resolvedName,
      template_language: resolvedLang,
      to_digits_tail: toDigits.slice(-4),
    },
  });
  const fail: MetaWhatsAppDeliveryResult = { ok: false, error: errMsg };
  await emitMetaDeliveryAudit(params.deliveryLog, toDigits, fail, "template");
  return fail;
}
