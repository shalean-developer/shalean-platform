const SYNTHETIC_RECIPIENT_DOMAINS = new Set([
  "cleaner.shalean.com",
]);

export type RecipientSafetyResult =
  | { allowed: true; normalized: string }
  | { allowed: false; reason: string };

/**
 * Validate a single external recipient before sending.
 * Blocks generated phone-number aliases such as 27...@cleaner.shalean.com,
 * which are authentication identities rather than real inboxes.
 */
export function validateEmailRecipient(value: string): RecipientSafetyResult {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { allowed: false, reason: "recipient_missing" };

  // Deliberately conservative: enough to reject malformed values without
  // pretending to fully implement RFC 5322.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { allowed: false, reason: "recipient_invalid" };
  }

  const domain = normalized.split("@").pop() ?? "";
  if (SYNTHETIC_RECIPIENT_DOMAINS.has(domain)) {
    return { allowed: false, reason: "recipient_synthetic_identity" };
  }

  return { allowed: true, normalized };
}

export function validateEmailRecipients(value: string | string[]): RecipientSafetyResult {
  const recipients = Array.isArray(value) ? value : [value];
  if (recipients.length !== 1) {
    for (const recipient of recipients) {
      const result = validateEmailRecipient(recipient);
      if (!result.allowed) return result;
    }
    return { allowed: true, normalized: recipients.map((recipient) => recipient.trim().toLowerCase()).join(",") };
  }
  return validateEmailRecipient(recipients[0] ?? "");
}
