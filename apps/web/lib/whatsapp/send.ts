/**
 * Legacy raw Graph body helper — removed. All outbound WhatsApp must use
 * {@link sendViaMetaWhatsApp} / {@link sendViaMetaWhatsAppTemplateBody} with `recipientRole: "cleaner"`.
 */
export function sendWhatsAppGraphPayload(_body: Record<string, unknown>): never {
  throw new Error(
    "sendWhatsAppGraphPayload is disabled — use sendViaMetaWhatsApp or sendViaMetaWhatsAppTemplateBody (cleaner-only)",
  );
}
