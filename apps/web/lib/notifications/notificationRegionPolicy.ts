import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

/**
 * ISO 3166-1 alpha-2. Extend `WHATSAPP_FIRST_COUNTRY_CODES` / phone prefix map as you add markets.
 */
const DEFAULT_BUSINESS_COUNTRY = String(process.env.DEFAULT_NOTIFICATION_BUSINESS_COUNTRY ?? "ZA")
  .trim()
  .toUpperCase()
  .slice(0, 2) || "ZA";

function parseWhatsappFirstCountries(): Set<string> {
  const raw = String(process.env.WHATSAPP_FIRST_COUNTRY_CODES ?? "ZA").trim();
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase().slice(0, 2))
    .filter((s) => s.length === 2);
  return new Set(parts.length ? parts : ["ZA"]);
}

const WHATSAPP_FIRST = parseWhatsappFirstCountries();

/** Map common international dial prefixes → ISO country (expand over time). */
function countryFromE164Digits(digits: string): string | null {
  if (digits.startsWith("27") && digits.length >= 11) return "ZA";
  if (digits.startsWith("1") && digits.length >= 11) return "US";
  if (digits.startsWith("44")) return "GB";
  if (digits.startsWith("234")) return "NG";
  if (digits.startsWith("254")) return "KE";
  return null;
}

function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Infers customer country for routing. Phone E164 wins; else snapshot hints; else business default.
 */
export function inferCustomerCountryForNotifications(params: {
  phone: string | null | undefined;
  snapshot: BookingSnapshotV1 | null;
}): string {
  const d = digitsOnlyPhone(String(params.phone ?? ""));
  const fromPhone = d.length >= 10 ? countryFromE164Digits(d) : null;
  if (fromPhone) return fromPhone;

  const loc = String(params.snapshot?.flat?.location ?? params.snapshot?.locked?.location ?? "").toLowerCase();
  if (loc.includes("south africa") || loc.includes(" za,") || loc.endsWith(" za")) return "ZA";

  return DEFAULT_BUSINESS_COUNTRY;
}

/** When true, try WhatsApp before SMS for payment_confirmed (null user preference). */
export function preferWhatsappFirstForPaymentPhone(params: {
  phone: string | null | undefined;
  snapshot: BookingSnapshotV1 | null;
}): boolean {
  const cc = inferCustomerCountryForNotifications(params);
  return WHATSAPP_FIRST.has(cc);
}
