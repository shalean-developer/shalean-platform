/** Re-exports Meta WhatsApp send helpers used by queue workers. */
export {
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplate,
  metaCircuitOpenRemainingMs,
  isMetaSendCircuitOpen,
  type MetaSendResult,
} from "./metaSend.ts";
