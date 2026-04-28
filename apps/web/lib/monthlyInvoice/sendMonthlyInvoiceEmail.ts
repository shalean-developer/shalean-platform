import "server-only";

import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export async function sendMonthlyInvoiceEmail(params: {
  to: string;
  monthLabel: string;
  totalZar: number;
  paymentUrl: string;
  dueDateLabel: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "monthly_invoice/email", "RESEND_API_KEY not set", {
      to: params.to,
    });
    return { sent: false, error: "RESEND_API_KEY not set" };
  }

  const amount = `R ${Math.round(params.totalZar).toLocaleString("en-ZA")}`;
  const subject = `Your Shalean invoice — ${params.monthLabel}`;
  const html = `
    <p>Hi,</p>
    <p>Your consolidated cleaning invoice for <strong>${params.monthLabel}</strong> is ready.</p>
    <p><strong>Amount due:</strong> ${amount}<br/>
    <strong>Due:</strong> ${params.dueDateLabel}</p>
    <p><a href="${params.paymentUrl}">Pay securely with Paystack</a></p>
    <p>Thank you for choosing Shalean.</p>
  `;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
  });

  if (error) {
    await reportOperationalIssue("error", "monthly_invoice/email", error.message, { to: params.to });
    return { sent: false, error: error.message };
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/email",
    message: "monthly_invoice_sent",
    context: { to: params.to, month: params.monthLabel },
  });

  return { sent: true };
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
  dueDateLabel: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "monthly_invoice/reminder_email", "RESEND_API_KEY not set", {
      to: params.to,
    });
    return { sent: false, error: "RESEND_API_KEY not set" };
  }

  const fmt = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
  const dayPart = params.daysPastDue === 1 ? "1 day" : `${params.daysPastDue} days`;
  const subject = `Reminder: Shalean invoice overdue (${dayPart})`;
  const pay = escapeHtml(params.paymentUrl);
  const html = `
    <p>Hi,</p>
    <p>Your invoice is overdue by <strong>${params.daysPastDue}</strong> day${params.daysPastDue === 1 ? "" : "s"}.</p>
    <p><strong>Period:</strong> ${escapeHtml(params.monthLabel)}<br/>
    <strong>Total:</strong> ${fmt(params.totalZar)}<br/>
    <strong>Paid:</strong> ${fmt(params.paidZar)}<br/>
    <strong>Balance due:</strong> ${fmt(params.balanceZar)}<br/>
    <strong>Due date:</strong> ${escapeHtml(params.dueDateLabel)}</p>
    <p><a href="${pay}">Pay securely with Paystack</a></p>
    <p>Thank you,<br/>Shalean Cleaning Services</p>
  `;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: params.to,
    subject,
    html,
  });

  if (error) {
    await reportOperationalIssue("error", "monthly_invoice/reminder_email", error.message, { to: params.to });
    return { sent: false, error: error.message };
  }

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/reminder_email",
    message: "monthly_invoice_reminder_sent",
    context: { to: params.to, month: params.monthLabel, daysPastDue: params.daysPastDue },
  });

  return { sent: true };
}
