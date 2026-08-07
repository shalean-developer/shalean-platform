import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateInput,
  WhatsAppTextInput,
} from "./types";

const DEFAULT_BASE_URL = "https://wapi.flaxxa.com/api";
const REQUEST_TIMEOUT_MS = 12_000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function apiBaseUrl(): string {
  return process.env.FLAXXA_WAPI_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function headers(): Record<string, string> {
  const token = requiredEnv("FLAXXA_WAPI_API_KEY");
  const authHeader = process.env.FLAXXA_WAPI_AUTH_HEADER?.trim() || "Authorization";
  const authScheme = process.env.FLAXXA_WAPI_AUTH_SCHEME?.trim() || "Bearer";
  return {
    "Content-Type": "application/json",
    [authHeader]: authScheme ? `${authScheme} ${token}` : token,
  };
}

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function extractMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj.message_id,
    obj.messageId,
    obj.id,
    (obj.data as Record<string, unknown> | undefined)?.message_id,
    (obj.data as Record<string, unknown> | undefined)?.messageId,
    (obj.data as Record<string, unknown> | undefined)?.id,
  ];
  const found = candidates.find((v) => typeof v === "string" && v.trim());
  return typeof found === "string" ? found.trim() : undefined;
}

async function post(path: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const raw = await res.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    if (!res.ok) {
      return {
        ok: false,
        provider: "flaxxa",
        error: `Flaxxa HTTP ${res.status}: ${raw.slice(0, 500)}`,
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
  return process.env.FLAXXA_WAPI_SEND_TEXT_PATH?.trim() || "/messages/send";
}

function templateEndpoint(): string {
  return process.env.FLAXXA_WAPI_SEND_TEMPLATE_PATH?.trim() || "/messages/template";
}

export const flaxxaWhatsAppProvider: WhatsAppProvider = {
  async sendText(input: WhatsAppTextInput): Promise<WhatsAppSendResult> {
    const phone = normalizePhone(input.phone);
    if (phone.length < 10 || phone.length > 15) {
      return { ok: false, provider: "flaxxa", error: "invalid_phone" };
    }
    return post(textEndpoint(), {
      phone,
      to: phone,
      message: input.message,
      text: input.message,
      recipient_role: input.recipientRole,
    });
  },

  async sendTemplate(input: WhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    const phone = normalizePhone(input.phone);
    if (phone.length < 10 || phone.length > 15) {
      return { ok: false, provider: "flaxxa", error: "invalid_phone" };
    }
    return post(templateEndpoint(), {
      phone,
      to: phone,
      template_name: input.templateName,
      templateName: input.templateName,
      language: input.language || "en",
      body_params: input.bodyParams || [],
      bodyParams: input.bodyParams || [],
      recipient_role: input.recipientRole,
    });
  },
};
