import { getResend } from "@/lib/email/resendFrom";
import { validateEmailRecipients } from "@/lib/email/recipientSafety";
import { applyOutboundSubjectPrefix, decideOutboundEmail } from "@/lib/env/outboundMessagingSafety";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type EmailContext = {
  bookingId?: string | null;
  customerId?: string | null;
  messageType?: string | null;
  campaignId?: string | null;
};

type SafeResendPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  attachments?: unknown[];
  tags?: { name: string; value: string }[];
  context?: EmailContext;
};

function contextTags(context: EmailContext | undefined): { name: string; value: string }[] {
  if (!context) return [];
  return [
    ["booking_id", context.bookingId],
    ["customer_id", context.customerId],
    ["message_type", context.messageType],
    ["campaign_id", context.campaignId],
  ].flatMap(([name, value]) => value ? [{ name: String(name), value: String(value).slice(0, 256) }] : []);
}

function firstRecipient(to: string | string[]): string {
  return (Array.isArray(to) ? to[0] : to)?.trim().toLowerCase() ?? "";
}

/** Resend wrapper with recipient validation, context tags and durable recovery records. */
export async function safeResendSend(payload: SafeResendPayload): Promise<{
  data: { id: string } | null;
  error: { message: string; name?: string } | null;
}> {
  const recipientSafety = validateEmailRecipients(payload.to);
  if (!recipientSafety.allowed) return { data: null, error: { message: recipientSafety.reason, name: "recipient_blocked" } };

  const resend = getResend();
  if (!resend) return { data: null, error: { message: "Email not configured", name: "resend_unconfigured" } };

  const decision = decideOutboundEmail(payload.to);
  if (!decision.allowed) return { data: null, error: { message: decision.reason, name: "outbound_blocked" } };

  const { context, tags = [], ...sendPayload } = payload;
  const mergedTags = [...tags, ...contextTags(context)].filter((tag, index, all) =>
    all.findIndex((candidate) => candidate.name === tag.name) === index,
  );
  const subject = applyOutboundSubjectPrefix(payload.subject, decision.subjectPrefix);
  const result = await resend.emails.send({ ...sendPayload, subject, tags: mergedTags } as Parameters<typeof resend.emails.send>[0]);

  const admin = getSupabaseAdmin();
  if (admin) {
    const retryable = !payload.attachments?.length;
    await admin.from("email_outbound_messages").insert({
      resend_email_id: result.data?.id ?? null,
      recipient_email: firstRecipient(payload.to),
      sender_email: payload.from,
      subject,
      html_body: retryable ? payload.html ?? null : null,
      text_body: retryable ? payload.text ?? null : null,
      reply_to: payload.replyTo ? (Array.isArray(payload.replyTo) ? payload.replyTo : [payload.replyTo]) : [],
      headers: payload.headers ?? {},
      tags: mergedTags,
      booking_id: context?.bookingId ?? null,
      customer_id: context?.customerId ?? null,
      message_type: context?.messageType ?? null,
      campaign_id: context?.campaignId ?? null,
      delivery_status: result.error ? "send_failed" : "sent",
      failure_reason: result.error?.message ?? null,
      retry_status: retryable && result.error ? "queued" : retryable ? "none" : "blocked",
      next_retry_at: retryable && result.error ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
    });
  }

  return {
    data: result.data ? { id: result.data.id } : null,
    error: result.error ? { message: result.error.message, name: result.error.name } : null,
  };
}
