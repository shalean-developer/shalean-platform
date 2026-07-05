import twilio from "twilio";
import {
  getSmsOutboundDecision,
  type CommunicationRecipientKind,
} from "@/lib/notifications/communicationPolicy";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";

function normalizeToE164(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const d = trimmed.replace(/\D/g, "");
  if (!d) return null;
  const candidate =
    d.startsWith("27") ? `+${d}` : d.length === 9 ? `0${d}` : d.startsWith("0") ? `+27${d.slice(1)}` : `+${d}`;
  const e164 = customerPhoneToE164(candidate).trim();
  if (!e164 || e164.length < 11) return null;
  return e164;
}

export type SendSmsResult =
  | { ok: true; sid: string }
  | { ok: false; error: string };

/**
 * Decorates Twilio SDK errors so log lines and metrics tell ops *why* a send
 * failed instead of bare provider strings like "Authenticate".
 *
 * Twilio's REST client throws errors shaped like
 *   { status: 401, code: 20003, message: "Authenticate", moreInfo: "..." }
 * When `status >= 400` and the message looks auth-shaped, we prefix with
 * `twilio_auth_failed (status=401, code=20003)` and append a remediation hint.
 */
export function describeTwilioSendError(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: number | string; status?: number; moreInfo?: string };
  const text = String(err.message ?? e ?? "twilio_unknown_error").trim();
  const status = typeof err.status === "number" ? err.status : null;
  const code = typeof err.code === "number" || typeof err.code === "string" ? String(err.code) : null;
  const looksAuth =
    status === 401 ||
    /^auth(enticate|entication)?\b/i.test(text) ||
    /invalid\s+(account|credentials|username|password|api)/i.test(text);

  if (looksAuth) {
    const tags = [status ? `status=${status}` : null, code ? `code=${code}` : null]
      .filter(Boolean)
      .join(", ");
    const prefix = tags ? `twilio_auth_failed (${tags})` : "twilio_auth_failed";
    const hint = "verify TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars";
    return `${prefix}: ${text} — ${hint}`.slice(0, 500);
  }

  if (status && status >= 400) {
    const tags = [`status=${status}`, code ? `code=${code}` : null].filter(Boolean).join(", ");
    return `twilio_http_error (${tags}): ${text}`.slice(0, 500);
  }

  return text.slice(0, 500);
}

/**
 * Sends SMS via Twilio. Server-only.
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (or TWILIO_FROM_NUMBER).
 */
export async function sendSms(params: {
  toPhone: string;
  message: string;
  /** Defaults to `cleaner` (dispatch offer SMS). */
  recipientKind?: CommunicationRecipientKind;
}): Promise<SendSmsResult> {
  const smsDecision = getSmsOutboundDecision(params.recipientKind ?? "cleaner");
  if (!smsDecision.allowed) {
    return { ok: false, error: smsDecision.reason };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.TWILIO_PHONE_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    "";
  const to = normalizeToE164(params.toPhone);
  const body = params.message.replace(/\r\n/g, "\n").trimEnd();

  if (!sid || !token || !from) {
    return { ok: false, error: "twilio_not_configured" };
  }
  if (!to) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({
      to,
      from,
      body: body.slice(0, 1600),
    });
    const sidOut = msg.sid ?? "";
    if (!sidOut) return { ok: false, error: "twilio_missing_sid" };
    return { ok: true, sid: sidOut };
  } catch (e) {
    return { ok: false, error: describeTwilioSendError(e) };
  }
}
