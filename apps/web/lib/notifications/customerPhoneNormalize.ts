/** Customer phone → E.164-style for logs, health cache, and Twilio (ZA-first heuristics). */
export function customerPhoneToE164(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("27") && d.length >= 11) return `+${d}`;
  if (d.length === 9) return `+27${d}`;
  if (d.length === 10 && d.startsWith("0")) return `+27${d.slice(1)}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return d.length >= 10 ? `+${d}` : "";
}

function digitsTail(raw: string, max = 15): string {
  return raw.replace(/\D/g, "").slice(-max);
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Stable key for `customer_contact_health`: prefer E.164 when parseable, else `digits:<last15>`.
 */
export function buildCustomerContactPhoneKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const e164 = customerPhoneToE164(s);
  if (e164.length >= 11) return e164;
  const tail = digitsTail(s, 15);
  if (tail.length >= 9) return `digits:${tail}`;
  return null;
}

/** Digits used for loose recipient matching (E.164 keys). */
export function phoneKeyDigitsForMatch(phoneKey: string): string {
  if (phoneKey.startsWith("digits:")) return phoneKey.slice(7);
  return digitsOnly(phoneKey);
}
