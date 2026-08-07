import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateInput,
  WhatsAppTextInput,
} from "./types";

const DEFAULT_BASE_URL = "https://wapi.flaxxa.com";
const DEFAULT_TEXT_PATH = "/api/v1/sendmessage";
const DEFAULT_TEMPLATE_PATH = "/api/v1/sendtemplatemessage";
const REQUEST_TIMEOUT_MS = 12_000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function apiBaseUrl(): string {
  return (process.env.FLAXXA_WAPI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function extractMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const data = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : undefined;
  const candidates = [obj.message_wamid, obj.message_id, obj.messageId, obj.id, data?.message_wamid, data?.message_id, data?.messageId, data?.id];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function payloadError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const status = typeof obj.status === "string" ? obj.status.toLowerCase() : "";
  if (status !== "error") return undefined;
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  if (typeof obj.msg === "string" && obj.msg.trim()) return obj.msg.trim();
  return "Flaxxa API returned status=error";
}

async function post(path: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  try {
    const token = requiredEnv("FLAXXA_WAPI_API_KEY");
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ token, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const raw = await res.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }

    const apiError = payloadError(payload);
    if (!res.ok || apiError) {
      return {
        ok: false,
        provider: "flaxxa",
        error: apiError || `Flaxxa HTTP ${res.status}: ${raw.slice(0, 500)}`,
      };
    }

    const messageId = extractMessageId(payload);
    return { ok: true, provider: "flaxxa", messageId };
  } catch (error) {
    return {
      ok: false,
      provider: "flaxxa",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function textEndpoint(): string {
  return process.env.FLAXXA_WAPI_SEND_TEXT_PATH?.trim() || DEFAULT_TEXT_PATH;
}

function templateEndpoint(): string {
  return process.env.FLAXXA_WAPI_SEND_TEMPLATE_PATH?.trim() || DEFAULT_TEMPLATE_PATH;
}

function templateComponents(bodyParams: string[]): Array<Record<string, unknown>> {
  if (!bodyParams.length) return [];
  return [
    {
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text: String(text ?? "") })),
    },
  ];
}

export const flaxxaWhatsAppProvider: WhatsAppProvider = {
  async sendText(input: WhatsAppTextInput): Promise<WhatsAppSendResult> {
    const phone = normalizePhone(input.phone);
    if (phone.length < 7 || phone.length > 15) {
      return { ok: false, provider: "flaxxa", error: "invalid_phone" };
    }
    return post(textEndpoint(), {
      phone,
      message: input.message,
    });
  },

  async sendTemplate(input: WhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    const phone = normalizePhone(input.phone);
    if (phone.length < 7 || phone.length > 15) {
      return { ok: false, provider: "flaxxa", error: "invalid_phone" };
    }
    const bodyParams = input.bodyParams || [];
    return post(templateEndpoint(), {
      phone,
      template_name: input.templateName,
      template_language: input.language || "en_US",
      components: templateComponents(bodyParams),
    });
  },
};
