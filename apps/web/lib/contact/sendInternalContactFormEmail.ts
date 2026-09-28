import { resolveDeploymentDisplayEnvironment } from "@/lib/env/deploymentEnvironment";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { safeResendSend } from "@/lib/email/safeResendSend";
import { CONTACT_FORM_RECIPIENT } from "@/lib/contact/contactFormContract";
import { assertNotSeedEmail } from "@/lib/seed/devSeedGuard";

type ContactEmailInput = {
  replyTo: string;
  subject: string;
  text: string;
  html: string;
};

const CONTACT_TAGS = [{ name: "message_type", value: "website_contact_form" }] as const;

async function sendDirectToPricingTestInbox(
  input: ContactEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };

  const marker = "[SHALEAN STAGING — TEST]";
  const subject = input.subject.startsWith(marker)
    ? input.subject
    : `${marker} ${input.subject}`;

  // Mandatory guard immediately before the non-production provider call.
  assertNotSeedEmail(CONTACT_FORM_RECIPIENT, "website-contact-form");

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: CONTACT_FORM_RECIPIENT,
    replyTo: input.replyTo,
    subject,
    text: input.text,
    html: input.html,
    tags: [...CONTACT_TAGS],
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true };
}

export async function sendInternalContactFormEmail(
  input: ContactEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const deployment = resolveDeploymentDisplayEnvironment();

  // pricing-test is a fixed-recipient internal UAT channel. Its Plesk runtime
  // historically carries SHALEAN_APP_ENV=test, so use the display resolver,
  // which identifies the pricing-test host as staging.
  if (deployment === "staging") {
    return sendDirectToPricingTestInbox(input);
  }

  // Production keeps the standard durable recovery path. Local/dev/preview
  // also stay behind the existing outbound kill switch / allowlist policy.
  const result = await safeResendSend({
    from: getDefaultFromAddress(),
    to: CONTACT_FORM_RECIPIENT,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    tags: [...CONTACT_TAGS],
    context: { messageType: "website_contact_form" },
  });

  if (result.error) return { sent: false, error: result.error.message };
  return { sent: true };
}
