import { logSystemEvent } from "@/lib/logging/systemLog";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";

function digitsToSaE164(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (!d) return null;
  return customerPhoneToE164(d.startsWith("27") ? `+${d}` : d.length === 9 ? `0${d}` : `+${d}`);
}

type QueueJobLike = {
  phone: string;
  payload: unknown;
  context: unknown;
};

/**
 * When a queue job exhausts retries (cron path), optionally SMS the same body.
 * Only runs when context has `terminal_sms_in_worker_only: true` (async enqueue-only flows).
 */
export async function sendTerminalQueueFailureSmsIfEligible(
  _admin: unknown,
  job: QueueJobLike,
): Promise<void> {
  const ctx =
    typeof job.context === "object" && job.context !== null && !Array.isArray(job.context)
      ? (job.context as Record<string, unknown>)
      : {};
  if (ctx.terminal_sms_in_worker_only !== true) return;
  /** Inline flush paths use notifyBookingEvent SMS — avoid duplicate Twilio sends. */
  if (ctx.skip_terminal_worker_sms === true) return;

  let body = typeof ctx.sms_body === "string" ? ctx.sms_body : "";
  if (!body.trim()) {
    const p = job.payload;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const o = p as Record<string, unknown>;
      if (o.kind === "text" && typeof o.text === "string") body = o.text;
    }
  }
  if (!body.trim()) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_queue_terminal_sms_skip",
      message: "No SMS body for terminal WhatsApp failure",
      context: { phone_tail: job.phone.slice(-4) },
    });
    return;
  }

  const e164 = digitsToSaE164(job.phone);
  if (!e164) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_queue_terminal_sms_skip",
      message: "Could not derive E.164 for terminal SMS",
      context: { phone_tail: job.phone.slice(-4) },
    });
    return;
  }

  const smsRes = await sendSmsFallback({
    toE164: e164,
    body: body.slice(0, 1200),
    context: {
      ...ctx,
      channel: "whatsapp_queue_terminal_fallback",
      queue_terminal_failure: true,
    },
  });

  await logSystemEvent({
    level: smsRes.sent ? "info" : "warn",
    source: "whatsapp_queue_terminal_sms",
    message: smsRes.sent ? "SMS sent after WhatsApp queue exhausted" : `SMS fallback failed: ${smsRes.error ?? "unknown"}`,
    context: { phone_tail: job.phone.slice(-4), sms_sent: smsRes.sent },
  });
}
