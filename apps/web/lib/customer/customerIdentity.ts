import { digitsOnly, normalizeSouthAfricaPhone } from "@/lib/utils/phone";

/**
 * Stable login email for walk-in customers without a personal email (Auth requires an email).
 * Example: +27810768318 → 27810768318@walkin.shalean.com
 */
export function customerGeneratedLoginEmailFromE164(normalizedPhone: string): string {
  const d = digitsOnly(normalizedPhone);
  return `${d}@walkin.shalean.com`.toLowerCase();
}

export function customerGeneratedLoginEmailFromAnyPhone(phone: string): string | null {
  const n = normalizeSouthAfricaPhone(phone);
  if (!n) return null;
  return customerGeneratedLoginEmailFromE164(n);
}
