import "server-only";

import { sendViaMetaWhatsApp } from "@/lib/dispatch/metaWhatsAppSend";

/**
 * Direct Meta Cloud API text send (same path as dispatch `sendViaMetaWhatsApp`).
 * Use for manual smoke tests; phone may include `+` or spaces — digits are normalized server-side.
 */
export async function sendTestWhatsApp(
  phone: string,
  message = `Shalean WhatsApp test ${new Date().toISOString()}`,
): Promise<{ messageId: string }> {
  return sendViaMetaWhatsApp({ phone, message, recipientRole: "cleaner" });
}
