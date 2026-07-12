/** Customer-facing support contacts — isomorphic (web + mobile). */

export const CUSTOMER_SUPPORT_EMAIL = "support@shalean.com";

/** Call number — 087 153 5250 */
export const CUSTOMER_SUPPORT_TELEPHONE_E164 = "+27871535250";
export const CUSTOMER_SUPPORT_TELEPHONE_DISPLAY = "087 153 5250";
export const CUSTOMER_SUPPORT_TELEPHONE_TEL = "tel:0871535250";

/** WhatsApp number — 082 591 5525 */
export const CUSTOMER_SUPPORT_WHATSAPP_E164 = "+27825915525";
export const CUSTOMER_SUPPORT_WHATSAPP_DISPLAY = "082 591 5525";

export function customerSupportWhatsAppHref(): string {
  return `https://wa.me/${CUSTOMER_SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}`;
}

/** Build a wa.me URL with optional prefilled message. */
export function buildCustomerSupportWhatsAppUrl(
  prefillText = "Hi I want to book a cleaning",
): string {
  return `${customerSupportWhatsAppHref()}?text=${encodeURIComponent(prefillText)}`;
}
