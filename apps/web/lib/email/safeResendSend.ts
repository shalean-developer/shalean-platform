import { getResend } from "@/lib/email/resendFrom";
import { validateEmailRecipients } from "@/lib/email/recipientSafety";
import { applyOutboundSubjectPrefix, decideOutboundEmail } from "@/lib/env/outboundMessagingSafety";

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

/** Resend wrapper with recipient validation, environment safety and standard business-context tags. */
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
  return {
    data: result.data ? { id: result.data.id } : null,
    error: result.error ? { message: result.error.message, name: result.error.name } : null,
  };
}
