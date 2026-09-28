import { outboundTestMessageMarker } from "@/lib/env/deploymentEnvironment";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { CONTACT_FORM_RECIPIENT } from "@/lib/contact/contactFormContract";

export async function sendInternalContactFormEmail(input: {
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };

  const marker = outboundTestMessageMarker();
  const subject = marker && !input.subject.startsWith(marker)
    ? `${marker} ${input.subject}`
    : input.subject;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: CONTACT_FORM_RECIPIENT,
    replyTo: input.replyTo,
    subject,
    text: input.text,
    html: input.html,
    tags: [{ name: "message_type", value: "website_contact_form" }],
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true };
}
