import { getResend } from "@/lib/email/resendFrom";
import { validateEmailRecipients } from "@/lib/email/recipientSafety";
import {
  applyOutboundSubjectPrefix,
  decideOutboundEmail,
} from "@/lib/env/outboundMessagingSafety";

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
};

/**
 * Resend send wrapper with recipient validation, non-production allowlist,
 * and subject markers. Synthetic auth aliases are never valid inboxes.
 */
export async function safeResendSend(payload: SafeResendPayload): Promise<{
  data: { id: string } | null;
  error: { message: string; name?: string } | null;
}> {
  const recipientSafety = validateEmailRecipients(payload.to);
  if (!recipientSafety.allowed) {
    return {
      data: null,
      error: { message: recipientSafety.reason, name: "recipient_blocked" },
    };
  }

  const resend = getResend();
  if (!resend) {
    return { data: null, error: { message: "Email not configured", name: "resend_unconfigured" } };
  }

  const decision = decideOutboundEmail(payload.to);
  if (!decision.allowed) {
    return {
      data: null,
      error: { message: decision.reason, name: "outbound_blocked" },
    };
  }

  const subject = applyOutboundSubjectPrefix(payload.subject, decision.subjectPrefix);
  // Resend SDK typings are wider than our SafeResendPayload; cast at the boundary.
  const result = await resend.emails.send({ ...payload, subject } as Parameters<
    typeof resend.emails.send
  >[0]);
  return {
    data: result.data ? { id: result.data.id } : null,
    error: result.error ? { message: result.error.message, name: result.error.name } : null,
  };
}
