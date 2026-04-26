import { metaWhatsAppToDigits } from "@/lib/dispatch/metaWhatsAppSend";

/**
 * Meta Cloud API `to` field: **digits only** (no `+`), country code included (e.g. `27831234567`).
 * Not E.164 with plus — use {@link metaWhatsAppToDigits} semantics.
 */
export function toMetaPhone(phone: string): string {
  return metaWhatsAppToDigits(phone);
}
