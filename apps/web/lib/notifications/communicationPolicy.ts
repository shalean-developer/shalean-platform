/**
 * Outbound communication policy (email + SMS).
 *
 * **Email:** admin and customers only. Cleaner profile emails are synthetic login
 * addresses — never send marketing or operational mail to cleaners.
 *
 * **SMS:** disabled globally for now (`SMS_OUTBOUND_ENABLED` unset / not `true`).
 * When re-enabled, SMS is **cleaners only** — admin and customer SMS stay blocked.
 */
export type CommunicationRecipientKind = "customer" | "cleaner" | "admin";

export type SmsOutboundDecision = { allowed: true } | { allowed: false; reason: string };

/** Cleaner emails are auth placeholders, not real inboxes. */
export function isCleanerEmailOutboundAllowed(): boolean {
  return false;
}

/**
 * Returns whether an SMS may be sent for `recipientKind`.
 * Unknown / omitted kind is treated as customer (blocked when SMS is enabled).
 */
export function getSmsOutboundDecision(recipientKind?: CommunicationRecipientKind): SmsOutboundDecision {
  const enabled = process.env.SMS_OUTBOUND_ENABLED === "true";
  if (!enabled) {
    return { allowed: false, reason: "sms_outbound_disabled" };
  }
  if (recipientKind === "admin") {
    return { allowed: false, reason: "admin_sms_disabled_by_policy" };
  }
  if (recipientKind !== "cleaner") {
    return { allowed: false, reason: "customer_sms_disabled_by_policy" };
  }
  return { allowed: true };
}
