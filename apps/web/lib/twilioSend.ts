import twilio from "twilio";
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
 * Sends SMS via Twilio. Server-only.
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (or TWILIO_FROM_NUMBER).
 */
export async function sendSms(params: { toPhone: string; message: string }): Promise<SendSmsResult> {
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
    const err = e as { message?: string; code?: number };
    const text = err?.message ?? String(e);
    return { ok: false, error: text.slice(0, 500) };
  }
}
