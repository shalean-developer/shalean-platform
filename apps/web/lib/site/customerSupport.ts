/** Customer-facing support (guest bookings, cancellations, general enquiries). */

export const CUSTOMER_SUPPORT_EMAIL = "support@shalean.com";

/** Call number */
export const CUSTOMER_SUPPORT_TELEPHONE_E164 = "+27871535250";

/** WhatsApp number */
export const CUSTOMER_SUPPORT_WHATSAPP_E164 = "+27825915525";

/** Pre-filled WhatsApp chat */
export const CUSTOMER_SUPPORT_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim() ||
  "https://wa.me/27825915525?text=Hi%20I%20want%20to%20book%20a%20cleaning";