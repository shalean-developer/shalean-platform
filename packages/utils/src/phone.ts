/**
 * South Africa mobile helpers — store and match `+27` + 9 digits (E.164-style).
 */

/** Strip to digits only. */
export function digitsOnly(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

/**
 * Canonical SA mobile: `+27` + 9 national digits (e.g. `+27810768318`).
 * Returns `null` if the value cannot be parsed as a typical SA mobile.
 */
export function normalizeSouthAfricaPhone(input: string): string | null {
  const trimmed = input.replace(/\s+/g, "").trim();
  if (!trimmed) return null;
  const digits = digitsOnly(trimmed);
  if (!digits) return null;

  let national9: string | null = null;

  if (digits.startsWith("27") && digits.length >= 11) {
    national9 = digits.slice(2, 11);
  } else if (digits.startsWith("0") && digits.length >= 10) {
    national9 = digits.slice(1, 10);
  } else if (digits.length === 9) {
    national9 = digits;
  }

  if (!national9 || national9.length !== 9 || !/^\d{9}$/.test(national9)) {
    return null;
  }

  return `+27${national9}`;
}

/**
 * Values to try against `phone` / `phone_number` columns (legacy mixed formats in DB).
 */
export function southAfricaPhoneLookupVariants(input: string): string[] {
  const out = new Set<string>();
  const raw = input.replace(/\s+/g, "").trim();
  if (raw) out.add(raw);

  const canonical = normalizeSouthAfricaPhone(input);
  if (canonical) {
    out.add(canonical);
    const d = digitsOnly(canonical);
    if (d.length === 11) {
      out.add(d);
      out.add(`+${d}`);
      out.add(`0${d.slice(2)}`);
    }
  }

  const allDigits = digitsOnly(input);
  if (allDigits) out.add(allDigits);

  return [...out].filter(Boolean);
}
