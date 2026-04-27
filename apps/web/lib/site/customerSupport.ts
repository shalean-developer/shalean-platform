/** Customer-facing support (guest bookings, cancellations, general enquiries). */

export const CUSTOMER_SUPPORT_EMAIL = "support@shalean.co.za";

/** E.164 for JSON-LD and tel: links. */
export const CUSTOMER_SUPPORT_TELEPHONE_E164 = "+27215550123";

/** Pre-filled WhatsApp chat (wa.me digits = E.164 without +). */
export const CUSTOMER_SUPPORT_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim() ||
  "https://wa.me/27215550123?text=Hi%20I%20want%20to%20book%20a%20cleaning";
