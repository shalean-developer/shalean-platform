/**
 * Cleaner ops support contacts — mirrors apps/web/lib/site/customerSupport.ts.
 * Override via EXPO_PUBLIC_* when a dedicated cleaner ops line is configured.
 */
const envPhone =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_CLEANER_SUPPORT_PHONE?.trim()) || "";
const envWhatsApp =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_CLEANER_SUPPORT_WHATSAPP?.trim()) || "";
const envEmail =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_CLEANER_SUPPORT_EMAIL?.trim()) || "";

export const CLEANER_SUPPORT_PHONE_DISPLAY = envPhone || "087 153 5250";
export const CLEANER_SUPPORT_PHONE_E164 = envPhone
  ? normalizeE164(envPhone)
  : "+27871535250";

export const CLEANER_SUPPORT_WHATSAPP_DISPLAY = envWhatsApp || "082 591 5525";
export const CLEANER_SUPPORT_WHATSAPP_E164 = envWhatsApp
  ? normalizeE164(envWhatsApp)
  : "+27825915525";

export const CLEANER_SUPPORT_EMAIL = envEmail || "support@shalean.com";

export const CLEANER_APPLY_BASE_PATH = "/cleaner/apply";

function normalizeE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 9) return `+27${digits.slice(1)}`;
  if (digits.startsWith("27")) return `+${digits}`;
  return `+${digits}`;
}

export function cleanerSupportTelHref(): string {
  return `tel:${CLEANER_SUPPORT_PHONE_E164.replace(/\D/g, "")}`;
}

export function cleanerSupportWhatsAppHref(prefill?: string): string {
  const base = `https://wa.me/${CLEANER_SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}`;
  if (!prefill?.trim()) return base;
  return `${base}?text=${encodeURIComponent(prefill.trim())}`;
}

export function cleanerSupportMailtoHref(subject?: string): string {
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${CLEANER_SUPPORT_EMAIL}${q}`;
}

export function cleanerReferralInviteUrl(apiBaseUrl: string, referralCode: string): string {
  const origin = String(apiBaseUrl || "https://shalean.co.za").replace(/\/$/, "");
  const code = encodeURIComponent(referralCode.trim().toUpperCase());
  return `${origin}${CLEANER_APPLY_BASE_PATH}?ref=${code}`;
}
