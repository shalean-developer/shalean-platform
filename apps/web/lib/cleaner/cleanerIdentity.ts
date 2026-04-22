import { digitsOnly, normalizeSouthAfricaPhone } from "@/lib/utils/phone";

/**
 * Stable login email derived from normalized SA phone (digits only local part).
 * Example: +27810768318 → 27810768318@cleaner.shalean.com
 */
export function cleanerGeneratedLoginEmailFromE164(normalizedPhone: string): string {
  const d = digitsOnly(normalizedPhone);
  return `${d}@cleaner.shalean.com`.toLowerCase();
}

export function cleanerGeneratedLoginEmailFromAnyPhone(phone: string): string | null {
  const n = normalizeSouthAfricaPhone(phone);
  if (!n) return null;
  return cleanerGeneratedLoginEmailFromE164(n);
}
