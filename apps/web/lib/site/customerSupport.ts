/**
 * Compatibility shim — implementation lives in `@shalean/utils`.
 * Web may override WhatsApp URL via NEXT_PUBLIC_SUPPORT_WHATSAPP_URL.
 */
import { buildCustomerSupportWhatsAppUrl } from "@shalean/utils/customerSupport";

export {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_E164,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  CUSTOMER_SUPPORT_WHATSAPP_E164,
  CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
  customerSupportWhatsAppHref,
  buildCustomerSupportWhatsAppUrl,
} from "@shalean/utils/customerSupport";

/** Pre-filled WhatsApp chat (env override for web campaigns). */
export const CUSTOMER_SUPPORT_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_URL?.trim() || buildCustomerSupportWhatsAppUrl();
