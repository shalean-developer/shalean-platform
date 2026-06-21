import { normalizeEmail } from "@/lib/booking/normalizeEmail";

const SYSTEM_LOGIN_EMAIL = /@(cleaner|walkin)\.shalean\.com$/i;

/** Shalean-generated Auth login emails — not valid Zoho billing contact emails. */
export function isShaleanSystemLoginEmail(email: string | null | undefined): boolean {
  return SYSTEM_LOGIN_EMAIL.test(String(email ?? "").trim());
}

/** Returns a normalised billing email, or null when missing / synthetic login alias. */
export function normalizeBillingEmail(raw: string | null | undefined): string | null {
  const email = normalizeEmail(String(raw ?? "").trim());
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (isShaleanSystemLoginEmail(email)) return null;
  return email;
}

/** Extract SA phone from synthetic login email local part (digits only). */
export function phoneFromSystemLoginEmail(email: string | null | undefined): string | null {
  const raw = String(email ?? "").trim().toLowerCase();
  const match = raw.match(/^(\d{9,15})@(cleaner|walkin)\.shalean\.com$/);
  if (!match) return null;
  const digits = match[1];
  return digits.startsWith("27") ? `+${digits}` : digits;
}

/** First usable billing email from candidates (real addresses only). */
export function pickBillingEmail(candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const email = normalizeBillingEmail(raw);
    if (email) return email;
  }
  return null;
}
