/** Customer-facing support (guest bookings, cancellations, general enquiries). */

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

/** Pre-filled WhatsApp chat */
export const CUSTOMER_SUPPORT_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim() ||
  `${customerSupportWhatsAppHref()}?text=Hi%20I%20want%20to%20book%20a%20cleaning`;
