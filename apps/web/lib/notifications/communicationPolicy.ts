/**
 * Outbound communication policy.
 *
 * Current production policy (Aug 2026):
 * - WhatsApp is the primary phone notification channel.
 * - SMS is intentionally disabled for every recipient type.
 * - Email remains available for customers/admin where existing flows use it.
 * - Cleaner profile emails are synthetic login addresses and must not receive outbound mail.
 *
 * Important: SMS stays blocked even if an old deployment/environment still has
 * SMS_OUTBOUND_ENABLED=true. Re-enabling SMS must be an explicit code change so
 * we cannot accidentally start charging/sending through Twilio again.
 */
export type CommunicationRecipientKind = "customer" | "cleaner" | "admin";

export type SmsOutboundDecision = { allowed: true } | { allowed: false; reason: string };

/** Cleaner emails are auth placeholders, not real inboxes. */
export function isCleanerEmailOutboundAllowed(): boolean {
  return false;
}

/**
 * SMS is globally disabled while Shalean operates WhatsApp-first notifications.
 * Keep all Twilio call sites behind this function so old code paths fail closed.
 */
export function getSmsOutboundDecision(_recipientKind?: CommunicationRecipientKind): SmsOutboundDecision {
  return { allowed: false, reason: "sms_outbound_disabled_whatsapp_primary" };
}
