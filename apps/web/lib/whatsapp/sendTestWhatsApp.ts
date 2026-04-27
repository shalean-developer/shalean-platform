import "server-only";

import { type MetaWhatsAppDeliveryResult, sendViaMetaWhatsApp } from "@/lib/dispatch/metaWhatsAppSend";

/**
 * Direct Meta Cloud API text send (same path as dispatch `sendViaMetaWhatsApp`).
 * Use for manual smoke tests; phone may include `+` or spaces — digits are normalized server-side.
 */
export async function sendTestWhatsApp(
  phone: string,
  message = `Shalean WhatsApp test ${new Date().toISOString()}`,
): Promise<MetaWhatsAppDeliveryResult> {
  return sendViaMetaWhatsApp({ phone, message, recipientRole: "cleaner" });
}
