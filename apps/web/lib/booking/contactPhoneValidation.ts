/** Minimum digits for a contact phone (local or international). */
export const CONTACT_PHONE_MIN_DIGITS = 7;

/** ITU E.164 max significant digits. */
export const CONTACT_PHONE_MAX_DIGITS = 15;

export const CONTACT_PHONE_VALIDATION_MESSAGE =
  "Enter a valid phone number (e.g. 082 123 4567 or +27 82 123 4567)";

/** Allowed characters in a phone field (digits, +, common separators). */
const CONTACT_PHONE_CHARS_RE = /^[\d+\s().-]+$/;

export function contactPhoneDigitCount(raw: string): number {
  return String(raw ?? "").replace(/\D/g, "").length;
}

/** Accepts local SA (082…), international (+27…), and other common formats with 7–15 digits. */
export function isValidContactPhone(raw: string): boolean {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  if (!CONTACT_PHONE_CHARS_RE.test(trimmed)) return false;
  const digits = contactPhoneDigitCount(trimmed);
  return digits >= CONTACT_PHONE_MIN_DIGITS && digits <= CONTACT_PHONE_MAX_DIGITS;
}

export function trimContactPhone(raw: string): string {
  return String(raw ?? "").trim();
}
