import { Resend } from "resend";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: getDefaultFromAddress(), to, subject, html });
}

export async function sendSubscriptionPrechargeReminderEmail(params: {
  to: string;
  serviceLabel: string;
  dateYmd: string;
}): Promise<void> {
  const url = `${getPublicAppUrlBase()}/account/subscriptions`;
  await send(
    params.to,
    "Your cleaning is scheduled for tomorrow",
    `<p>Your ${params.serviceLabel} subscription will be charged tomorrow (${params.dateYmd}).</p><p><a href="${url}">Manage subscription</a></p>`,
  );
}

export async function sendSubscriptionChargeSuccessEmail(params: {
  to: string;
  serviceLabel: string;
  dateYmd: string;
}): Promise<void> {
  const url = `${getPublicAppUrlBase()}/account/bookings`;
  await send(
    params.to,
    "Payment successful — your cleaning is scheduled",
    `<p>Payment successful for your ${params.serviceLabel} subscription.</p><p>Your cleaning is scheduled for ${params.dateYmd}.</p><p><a href="${url}">View bookings</a></p>`,
  );
}

export async function sendSubscriptionChargeFailedEmail(params: {
  to: string;
  serviceLabel: string;
}): Promise<void> {
  const url = `${getPublicAppUrlBase()}/account/subscriptions`;
  await send(
    params.to,
    "Payment failed, please update your card",
    `<p>We couldn't charge your ${params.serviceLabel} subscription.</p><p>Please update your card/payment method and retry.</p><p><a href="${url}">Manage subscription</a></p>`,
  );
}
