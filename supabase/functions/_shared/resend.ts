/**
 * @module _shared/resend
 * @status CONTRACT ONLY
 *
 * Resend email API wrapper.
 * Ports from: apps/web/lib/email/resendFrom.ts
 */

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

export async function sendEmail(
  _params: SendEmailParams,
  _apiKey: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  throw new Error("Not implemented");
}
