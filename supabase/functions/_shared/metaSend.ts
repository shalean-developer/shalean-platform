import type { WorkerConfig } from "./config.ts";
import { logSystemEvent } from "./logger.ts";
import {
  isMetaSendCircuitOpen,
  metaCircuitOpenRemainingMs,
  recordMetaSendOutcome,
  throttleWhatsAppMetaSend,
} from "./metaSafeguards.ts";
import { metaWhatsAppToDigits, sleep } from "./utils.ts";

const META_SEND_TIMEOUT_MS = 12_000;
const MAX_SEND_ATTEMPTS = 3;
const WA_BODY_TEMPLATE_MAX = 1024;

export type MetaSendResult = { ok: true; messageId: string } | { ok: false; error: string };

function graphMessagesUrl(cfg: WorkerConfig): string {
  const id = cfg.whatsappPhoneNumberId;
  if (!id) throw new Error("WhatsApp not configured");
  return `https://graph.facebook.com/${cfg.whatsappGraphApiVersion}/${id}/messages`;
}

function assertWhatsAppConfigured(cfg: WorkerConfig): { token: string; phoneNumberId: string } {
  if (!cfg.whatsappAccessToken || !cfg.whatsappPhoneNumberId) {
    throw new Error("WhatsApp not configured");
  }
  return { token: cfg.whatsappAccessToken, phoneNumberId: cfg.whatsappPhoneNumberId };
}

function isMetaTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableMetaFailure(status: number, rawText: string, graphError?: string): boolean {
  if (isMetaTransientHttpStatus(status)) return true;
  const blob = `${graphError ?? ""} ${rawText}`.toLowerCase();
  return blob.includes("rate limit") || blob.includes("too many") || blob.includes("throttl") ||
    blob.includes("80007") || blob.includes("130429");
}

function metaGraphSendRetryDelayMs(attemptIndex: number): number {
  const base = attemptIndex <= 0 ? 1000 : attemptIndex === 1 ? 2000 : 5000;
  return base + Math.floor(Math.random() * 500);
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
    const err = json.error as { message?: string };
    return { ok: false, status: res.status, rawText, graphError: err.message ?? JSON.stringify(json.error) };
  }
  const messages = Array.isArray(json?.messages) ? (json!.messages as unknown[]) : [];
  const first = (messages[0] ?? null) as Record<string, unknown> | null;
  if (!first || typeof first.id !== "string" || !first.id.trim()) {
    return { ok: false, status: res.status, rawText, graphError: "missing_message_id" };
  }
  return { ok: true, messageId: first.id.trim() };
}

async function postMetaMessage(
  cfg: WorkerConfig,
  token: string,
  body: Record<string, unknown>,
  attempt: number,
): Promise<{ res: Response; rawText: string }> {
  const res = await fetch(graphMessagesUrl(cfg), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(META_SEND_TIMEOUT_MS),
  });
  const rawText = await res.text();
  if (!res.ok) {
    await logSystemEvent({
      level: "warn",
      source: "edge/whatsapp_meta_http",
      message: `Meta POST failed status=${res.status} attempt=${attempt + 1}`,
      context: { response_status: res.status, payload_type: body.type },
    });
  }
  return { res, rawText };
}

async function sendWithRetries(
  cfg: WorkerConfig,
  token: string,
  body: Record<string, unknown>,
): Promise<ParsedSuccess | ParsedFailure> {
  let lastFailure: ParsedFailure | null = null;
  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    if (attempt > 0 && lastFailure && isRetryableMetaFailure(lastFailure.status, lastFailure.rawText, lastFailure.graphError)) {
      await sleep(metaGraphSendRetryDelayMs(attempt - 1));
    }
    await throttleWhatsAppMetaSend(cfg);
    if (isMetaSendCircuitOpen()) {
      return { ok: false, status: 503, rawText: "circuit_open", graphError: "Meta WhatsApp send paused (circuit open)" };
    }
    const { res, rawText } = await postMetaMessage(cfg, token, body, attempt);
    const parsed = parseGraphMessagesResponse(res, rawText);
    if (parsed.ok) {
      recordMetaSendOutcome(true);
      return parsed;
    }
    lastFailure = parsed;
    recordMetaSendOutcome(false);
    if (isRetryableMetaFailure(res.status, rawText, parsed.graphError) && attempt < MAX_SEND_ATTEMPTS - 1) {
      continue;
    }
    break;
  }
  return lastFailure ?? { ok: false, status: 500, rawText: "unknown", graphError: "unknown" };
}

/** Send plain text via Meta Cloud API. */
export async function sendViaMetaWhatsApp(
  cfg: WorkerConfig,
  phone: string,
  message: string,
): Promise<MetaSendResult> {
  const { token } = assertWhatsAppConfigured(cfg);
  const toDigits = metaWhatsAppToDigits(phone);
  if (toDigits.length < 10 || toDigits.length > 15) {
    return { ok: false, error: `Invalid WhatsApp recipient digits length=${toDigits.length}` };
  }
  if (isMetaSendCircuitOpen()) {
    return { ok: false, error: "Meta WhatsApp send paused (circuit open) — will retry" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "text",
    text: { body: message },
  };

  const result = await sendWithRetries(cfg, token, body);
  if (result.ok) return { ok: true, messageId: result.messageId };
  return { ok: false, error: result.graphError ?? result.rawText ?? "send_failed" };
}

/** Send approved template with body parameters. */
export async function sendViaMetaWhatsAppTemplate(
  cfg: WorkerConfig,
  phone: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<MetaSendResult> {
  const { token } = assertWhatsAppConfigured(cfg);
  const toDigits = metaWhatsAppToDigits(phone);
  if (toDigits.length < 10 || toDigits.length > 15) {
    return { ok: false, error: `Invalid WhatsApp recipient digits length=${toDigits.length}` };
  }
  if (isMetaSendCircuitOpen()) {
    return { ok: false, error: "Meta WhatsApp send paused (circuit open) — will retry" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: bodyParameters.map((text) => ({ type: "text", text: text.slice(0, WA_BODY_TEMPLATE_MAX) })),
        },
      ],
    },
  };

  const result = await sendWithRetries(cfg, token, body);
  if (result.ok) return { ok: true, messageId: result.messageId };
  return { ok: false, error: result.graphError ?? result.rawText ?? "template_send_failed" };
}

export { metaCircuitOpenRemainingMs, isMetaSendCircuitOpen };
