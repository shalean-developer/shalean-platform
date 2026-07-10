import "server-only";

import {
  classifyResendSendError,
  type EmailSendErrorClassification,
  type ResendLikeError,
} from "@/lib/email/classifyResendSendError";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { emailSafeGoUrl } from "@/lib/email/emailSafeGoUrl";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_E164,
} from "@/lib/site/customerSupport";

export const MONTHLY_INVOICING_ANNOUNCEMENT_EFFECTIVE_LABEL = "1 July 2026";

export type MonthlyInvoicingAnnouncementParams = {
  to: string;
  firstName?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greeting(firstName?: string | null): string {
  const name = String(firstName ?? "").trim();
  return name ? escapeHtml(name.split(/\s+/)[0] ?? name) : "there";
}

function supportPhoneDisplay(): string {
  const raw = CUSTOMER_SUPPORT_TELEPHONE_E164.trim();
  if (raw.startsWith("+27")) {
    const digits = raw.slice(3);
    if (digits.length === 9) {
      return `0${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    }
  }
  return raw;
}

export function buildMonthlyInvoicingAnnouncementSubject(): string {
  return `Important update — Shalean monthly invoicing from ${MONTHLY_INVOICING_ANNOUNCEMENT_EFFECTIVE_LABEL}`;
}

export function buildMonthlyInvoicingAnnouncementHtml(params: MonthlyInvoicingAnnouncementParams): string {
  const hi = greeting(params.firstName);
  const supportEmail = escapeHtml(CUSTOMER_SUPPORT_EMAIL);
  const supportPhone = escapeHtml(supportPhoneDisplay());
  const effective = escapeHtml(MONTHLY_INVOICING_ANNOUNCEMENT_EFFECTIVE_LABEL);

  return `
<div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px 20px; color: #1f2937; line-height: 1.55;">
  <h2 style="margin: 0 0 4px; font-size: 22px; font-weight: 700;">Shalean<span style="color:#2563eb;">.</span></h2>
  <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">Cleaning Services</p>

  <p style="margin: 0 0 16px;">Hi ${hi},</p>

  <p style="margin: 0 0 16px;">
    We&rsquo;re improving how Shalean bills monthly cleaning customers.
    <strong>From ${effective}</strong>, you&rsquo;ll receive clearer monthly invoices for your recurring cleans.
  </p>

  <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; background: #f9fafb;">
    <p style="margin: 0 0 10px; font-weight: 600; font-size: 15px;">What&rsquo;s changing</p>
    <ul style="margin: 0; padding-left: 20px;">
      <li style="margin-bottom: 8px;"><strong>One invoice per month</strong> covering all scheduled cleans in that month</li>
      <li style="margin-bottom: 8px;">A secure <strong>Paystack payment link</strong> in your invoice email</li>
      <li style="margin-bottom: 0;">Invoice references like <strong>MI-XXXXXXXX</strong> for monthly billing</li>
    </ul>
  </div>

  <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px;">
    <p style="margin: 0 0 10px; font-weight: 600; font-size: 15px;">When is payment due?</p>
    <p style="margin: 0;">
      Payment is due <strong>after your last scheduled clean of the month</strong> &mdash; not on a fixed calendar date.
      We&rsquo;ll email you when your invoice is ready to pay, once all expected visits for that month are included.
    </p>
  </div>

  <div style="border: 1px solid #fde68a; border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; background: #fffbeb;">
    <p style="margin: 0 0 10px; font-weight: 600; font-size: 15px;">Grace period &amp; late payment fee</p>
    <ul style="margin: 0; padding-left: 20px;">
      <li style="margin-bottom: 8px;"><strong>5 days</strong> after the due date to pay without penalty</li>
      <li style="margin-bottom: 8px;">After that, a <strong>one-time late fee</strong> applies when you pay:
        <strong>5% of the invoice</strong> (minimum <strong>R75</strong>, maximum <strong>R200</strong>)</li>
      <li style="margin-bottom: 0;">The fee is charged once per invoice, not daily</li>
    </ul>
  </div>

  <p style="margin: 0 0 16px;">
    <strong>What you need to do:</strong> nothing right now. From ${effective}, continue as normal and pay using the link in your invoice email.
    Please make sure we have your <strong>correct email address</strong> on file.
  </p>

  <p style="margin: 0 0 20px;">
    Questions? Reply to this email or contact us at
    <a href="mailto:${supportEmail}" style="color:#2563eb;">${supportEmail}</a>
    or <a href="${escapeHtml(emailSafeGoUrl("call"))}" style="color:#2563eb;">${supportPhone}</a>.
  </p>

  <p style="margin: 0;">Thank you for your continued trust in Shalean.</p>
  <p style="margin: 12px 0 0;">Warm regards,<br/><strong>The Shalean Team</strong></p>

  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px;">
    Shalean Cleaning Services &middot; ${supportEmail}
  </p>
</div>`;
}

export type SendMonthlyInvoicingAnnouncementResult =
  | { sent: true }
  | { sent: false; error: string; classification: EmailSendErrorClassification };

export async function sendMonthlyInvoicingAnnouncementEmail(
  params: MonthlyInvoicingAnnouncementParams,
): Promise<SendMonthlyInvoicingAnnouncementResult> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, error: "RESEND_API_KEY not set", classification: "permanent_config" };
  }

  const to = params.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, error: "invalid_email", classification: "permanent_config" };
  }

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to,
    subject: buildMonthlyInvoicingAnnouncementSubject(),
    html: buildMonthlyInvoicingAnnouncementHtml(params),
  });

  if (error) {
    return {
      sent: false,
      error: error.message,
      classification: classifyResendSendError(error as ResendLikeError),
    };
  }

  return { sent: true };
}
