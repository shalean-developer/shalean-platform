import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type SubscriptionEmailSendResult = { sent: boolean; error?: string };

async function send(
  to: string,
  subject: string,
  html: string,
  source: string,
): Promise<SubscriptionEmailSendResult> {
  const resend = getResend();
  if (!resend) {
    const error = "RESEND_API_KEY not set";
    await reportOperationalIssue("warn", source, error, { to });
    return { sent: false, error };
  }

  const { error } = await resend.emails.send({ from: getDefaultFromAddress(), to, subject, html });
  if (error) {
    await reportOperationalIssue("warn", source, error.message, { to });
    return { sent: false, error: error.message };
  }

  await logSystemEvent({
    level: "info",
    source,
    message: "subscription_email_sent",
    context: { to, subject },
  });
  return { sent: true };
}

export async function sendSubscriptionPrechargeReminderEmail(params: {
  to: string;
  serviceLabel: string;
  dateYmd: string;
}): Promise<SubscriptionEmailSendResult> {
  const url = `${getPublicAppUrlBase()}/account/recurring`;
  return send(
    params.to,
    "Your cleaning is scheduled for tomorrow",
    `<p>Your ${params.serviceLabel} subscription will be charged tomorrow (${params.dateYmd}).</p><p><a href="${url}">Manage subscription</a></p>`,
    "subscription/precharge_reminder",
  );
}

/** Recurring engine: saved card will be charged for an upcoming visit (tomorrow service date). */
export async function sendRecurringVisitPrechargeReminderEmail(params: {
  to: string;
  serviceLabel: string;
  visitDateYmd: string;
}): Promise<SubscriptionEmailSendResult> {
  const url = `${getPublicAppUrlBase()}/dashboard/bookings`;
  return send(
    params.to,
    "Payment for your upcoming cleaning",
    `<p>Your saved card will be charged for your ${params.serviceLabel} visit on <strong>${params.visitDateYmd}</strong> (Africa/Johannesburg).</p><p>If you need to make changes, open your bookings.</p><p><a href="${url}">View bookings</a></p>`,
    "subscription/recurring_precharge_reminder",
  );
}

export async function sendSubscriptionChargeSuccessEmail(params: {
  to: string;
  serviceLabel: string;
  dateYmd: string;
}): Promise<SubscriptionEmailSendResult> {
  const url = `${getPublicAppUrlBase()}/dashboard/bookings`;
  return send(
    params.to,
    "Payment successful — your cleaning is scheduled",
    `<p>Payment successful for your ${params.serviceLabel} subscription.</p><p>Your cleaning is scheduled for ${params.dateYmd}.</p><p><a href="${url}">View bookings</a></p>`,
    "subscription/charge_success",
  );
}

export async function sendSubscriptionChargeFailedEmail(params: {
  to: string;
  serviceLabel: string;
}): Promise<SubscriptionEmailSendResult> {
  const url = `${getPublicAppUrlBase()}/account/recurring`;
  return send(
    params.to,
    "Payment failed, please update your card",
    `<p>We couldn't charge your ${params.serviceLabel} subscription.</p><p>Please update your card/payment method and retry.</p><p><a href="${url}">Manage subscription</a></p>`,
    "subscription/charge_failed",
  );
}
