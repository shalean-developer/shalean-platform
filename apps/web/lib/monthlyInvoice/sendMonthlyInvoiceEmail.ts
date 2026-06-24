import "server-only";

import {
  classifyResendSendError,
  type EmailSendErrorClassification,
  type ResendLikeError,
} from "@/lib/email/classifyResendSendError";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { loadMonthlyInvoiceEmailPdfAttachment } from "@/lib/monthlyInvoice/loadMonthlyInvoiceEmailPdfAttachment";
import { renderMonthlyInvoicePaymentLinksHtml } from "@/lib/monthlyInvoice/monthlyInvoicePaymentLinkHtml";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Discriminated send result. The `classification` field was added in M-9 so
 * cron loops can differentiate permanent-config failures (stop the run via
 * `notificationConfigBreaker`) from transient or per-recipient validation
 * failures (continue the run, retry on next cron tick). Pre-M-9 callers
 * that only inspected `sent` and `error` keep working unchanged.
 */
export type SendMonthlyInvoiceEmailResult =
  | { sent: true; classification: "ok" }
  | { sent: false; error: string; classification: EmailSendErrorClassification };

function formatResendSendError(error: ResendLikeError): string {
  const message = String(error.message ?? "email_send_failed").trim();
  const name = String(error.name ?? "").trim();
  if (name === "invalid_api_key" || /api key is invalid/i.test(message)) {
    return (
      "Resend rejected the API key. In apps/web/.env.local set RESEND_API_KEY to a current key from " +
      "resend.com/api-keys (no quotes or spaces), verify RESEND_FROM uses shalean.co.za, then restart npm run dev."
    );
  }
  if (name === "invalid_from_address" || /from address/i.test(message)) {
    return `Resend rejected the from address (${getDefaultFromAddress()}). Use a verified domain in RESEND_FROM.`;
  }
  return message;
}

function classifyMissingResendConfig(): EmailSendErrorClassification {
  return "permanent_config";
}

export async function sendMonthlyInvoiceEmail(params: {
  to: string;
  monthLabel: string;
  /** Billing month `YYYY-MM` — used for the PDF filename. */
  month?: string;
  totalZar: number;
  paymentUrl: string;
  /** Direct Paystack checkout URL when branded app link fails (e.g. mobile DNS). */
  paystackPaymentUrl?: string | null;
  dueDateLabel: string;
  zohoInvoiceId?: string | null;
}): Promise<SendMonthlyInvoiceEmailResult> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "monthly_invoice/email", "RESEND_API_KEY not set", {
      to: params.to,
    });
    return { sent: false, error: "RESEND_API_KEY not set", classification: classifyMissingResendConfig() };
  }

  const amount = `R ${Math.round(params.totalZar).toLocaleString("en-ZA")}`;
  const subject = `Your Shalean invoice — ${params.monthLabel}`;

  const pdfAttachment = await loadMonthlyInvoiceEmailPdfAttachment({
    zohoInvoiceId: params.zohoInvoiceId,
    month: params.month ?? params.monthLabel,
  });

  if (params.zohoInvoiceId && !pdfAttachment) {
    await reportOperationalIssue("warn", "monthly_invoice/email", "invoice_pdf_attachment_unavailable", {
      to: params.to,
      zohoInvoiceId: params.zohoInvoiceId,
    });
  }

  const pdfNote = pdfAttachment
    ? "<p>Your invoice PDF is attached to this email.</p>"
    : "";

  const paymentLinks = renderMonthlyInvoicePaymentLinksHtml({
    paymentUrl: params.paymentUrl,
    paystackFallbackUrl: params.paystackPaymentUrl,
  });

  const html = `
    <p>Hi,</p>
    <p>Your consolidated cleaning invoice for <strong>${params.monthLabel}</strong> is ready.</p>
    <p><strong>Amount due:</strong> ${amount}<br/>
    <strong>Due:</strong> ${params.dueDateLabel}</p>
    ${pdfNote}
    ${paymentLinks}
    <p>Thank you for choosing Shalean.</p>
  `;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
    ...(pdfAttachment
      ? {
          attachments: [
            {
              filename: pdfAttachment.filename,
              content: pdfAttachment.content,
            },
          ],
        }
      : {}),
  });

  if (error) {
    const classification = classifyResendSendError(error as ResendLikeError);
    await reportOperationalIssue(
      classification === "permanent_config" ? "error" : "warn",
      "monthly_invoice/email",
      error.message,
      { to: params.to, classification, resendErrorName: (error as ResendLikeError).name ?? null },
    );
    return { sent: false, error: formatResendSendError(error as ResendLikeError), classification };
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/email",
    message: "monthly_invoice_sent",
    context: { to: params.to, month: params.monthLabel, pdfAttached: Boolean(pdfAttachment) },
  });

  return { sent: true, classification: "ok" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Overdue reminder (distinct copy from initial invoice email). */
export async function sendMonthlyInvoiceReminderEmail(params: {
  to: string;
  daysPastDue: number;
  monthLabel: string;
  totalZar: number;
  paidZar: number;
  balanceZar: number;
  paymentUrl: string;
  paystackPaymentUrl?: string | null;
  dueDateLabel: string;
}): Promise<SendMonthlyInvoiceEmailResult> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "monthly_invoice/reminder_email", "RESEND_API_KEY not set", {
      to: params.to,
    });
    return { sent: false, error: "RESEND_API_KEY not set", classification: classifyMissingResendConfig() };
  }

  const fmt = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
  const dayPart = params.daysPastDue === 1 ? "1 day" : `${params.daysPastDue} days`;
  const subject = `Reminder: Shalean invoice overdue (${dayPart})`;
  const paymentLinks = renderMonthlyInvoicePaymentLinksHtml({
    paymentUrl: params.paymentUrl,
    paystackFallbackUrl: params.paystackPaymentUrl,
    primaryLinkText: "Pay your invoice online",
    fallbackLinkText: "pay directly via Paystack",
  });
  const html = `
    <p>Hi,</p>
    <p>Your invoice is overdue by <strong>${params.daysPastDue}</strong> day${params.daysPastDue === 1 ? "" : "s"}.</p>
    <p><strong>Period:</strong> ${escapeHtml(params.monthLabel)}<br/>
    <strong>Total:</strong> ${fmt(params.totalZar)}<br/>
    <strong>Paid:</strong> ${fmt(params.paidZar)}<br/>
    <strong>Balance due:</strong> ${fmt(params.balanceZar)}<br/>
    <strong>Due date:</strong> ${escapeHtml(params.dueDateLabel)}</p>
    ${paymentLinks}
    <p>Thank you,<br/>Shalean Cleaning Services</p>
  `;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
  });

  if (error) {
    const classification = classifyResendSendError(error as ResendLikeError);
    await reportOperationalIssue(
      classification === "permanent_config" ? "error" : "warn",
      "monthly_invoice/reminder_email",
      error.message,
      { to: params.to, classification },
    );
    return { sent: false, error: error.message, classification };
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/reminder_email",
    message: "monthly_invoice_reminder_sent",
    context: { to: params.to, month: params.monthLabel, daysPastDue: params.daysPastDue },
  });

  return { sent: true, classification: "ok" };
}
