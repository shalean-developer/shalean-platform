import { getResend } from "@/lib/email/resendFrom";
import { validateEmailRecipients } from "@/lib/email/recipientSafety";
import { syncResendAudienceContact } from "@/lib/email/syncResendAudienceContact";
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
  /** Retry workers set this false so the original recovery row remains the single source of truth. */
  recordRecovery?: boolean;
};

type SafeResendResult = {
  data: { id: string } | null;
  error: { message: string; name?: string } | null;
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

function thrownResendError(error: unknown): SafeResendResult {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "resend_send_threw";
  return { data: null, error: { message, name } };
}

/** Resend wrapper with recipient validation, context tags, Audience sync and durable recovery records. */
export async function safeResendSend(payload: SafeResendPayload): Promise<SafeResendResult> {
  const recipientSafety = validateEmailRecipients(payload.to);
  if (!recipientSafety.allowed) return { data: null, error: { message: recipientSafety.reason, name: "recipient_blocked" } };

  const resend = getResend();
  if (!resend) return { data: null, error: { message: "Email not configured", name: "resend_unconfigured" } };

  const decision = decideOutboundEmail(payload.to);
  if (!decision.allowed) return { data: null, error: { message: decision.reason, name: "outbound_blocked" } };

  const { context, tags = [], recordRecovery = true, ...sendPayload } = payload;
  const mergedTags = [...tags, ...contextTags(context)].filter((tag, index, all) =>
    all.findIndex((candidate) => candidate.name === tag.name) === index,
  );
  const subject = applyOutboundSubjectPrefix(payload.subject, decision.subjectPrefix);

  let result: SafeResendResult;
  try {
    const resendResult = await resend.emails.send({
      ...sendPayload,
      subject,
      tags: mergedTags,
    } as Parameters<typeof resend.emails.send>[0]);
    result = {
      data: resendResult.data ? { id: resendResult.data.id } : null,
      error: resendResult.error ? { message: resendResult.error.message, name: resendResult.error.name } : null,
    };
  } catch (error) {
    result = thrownResendError(error);
  }

  const recipientEmail = firstRecipient(payload.to);
  if (result.data?.id && context?.customerId && recipientEmail) {
    await syncResendAudienceContact({
      email: recipientEmail,
      customerId: context.customerId,
    }).catch((error) => {
      console.warn("Resend Audience sync raised an unexpected error", {
        email: recipientEmail,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const admin = recordRecovery ? getSupabaseAdmin() : null;
  if (admin) {
    const retryable = !payload.attachments?.length;
    await admin.from("email_outbound_messages").insert({
      resend_email_id: result.data?.id ?? null,
      recipient_email: recipientEmail,
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

  return result;
}
