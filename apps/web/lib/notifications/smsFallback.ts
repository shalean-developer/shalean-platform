import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Optional Twilio SMS. Configure: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164).
 * Returns true if send succeeded or was skipped as non-configured (caller may treat as soft-fail).
 */
export async function sendSmsFallback(params: {
  toE164: string;
  body: string;
  context: Record<string, unknown>;
}): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = params.toE164.replace(/\s/g, "");
  if (!to || !/^\+?\d{10,15}$/.test(to.replace(/^\+/, ""))) {
    await logSystemEvent({
      level: "warn",
      source: "sms_fallback_invalid_to",
      message: "Invalid SMS destination",
      context: { ...params.context, to: params.toE164 },
    });
    return false;
  }
  if (!sid || !token || !from) {
    await logSystemEvent({
      level: "info",
      source: "sms_fallback_disabled",
      message: "Twilio not configured — SMS skipped",
      context: params.context,
    });
    return false;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams();
  form.set("To", to.startsWith("+") ? to : `+${to.replace(/^\+/, "")}`);
  form.set("From", from);
  form.set("Body", params.body.slice(0, 1400));

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const t = await res.text();
      await reportOperationalIssue("warn", "sms_fallback", `Twilio ${res.status}: ${t.slice(0, 400)}`, params.context);
      return false;
    }
    await logSystemEvent({
      level: "info",
      source: "sms_fallback_sent",
      message: "SMS sent",
      context: params.context,
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "sms_fallback", msg, params.context);
    return false;
  }
}
