import { digitsOnly } from "@/lib/utils/phone";

/** Normalized phone key for deduplicating cleaner applications. */
export function normalizeCleanerApplicationPhone(phone: string): string {
  return digitsOnly(phone);
}

export const CLEANER_APPLICATION_DUPLICATE_MESSAGE =
  "We already have an application for this phone number. If you need help, contact us on WhatsApp.";

export const CLEANER_APPLICATION_ALREADY_CLEANER_MESSAGE =
  "This phone number is already linked to a Shalean cleaner account. Use cleaner login instead.";
