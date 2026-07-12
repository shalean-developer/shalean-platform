/** Canonical legal URLs for store listings and in-app links (match web redirects). */
export const PRIVACY_POLICY_PATH = "/privacy-policy";
export const TERMS_OF_SERVICE_PATH = "/terms-of-service";

export const PRIVACY_POLICY_URL = "https://shalean.co.za/privacy-policy";
export const TERMS_OF_SERVICE_URL = "https://shalean.co.za/terms-of-service";

export function buildLegalUrl(
  path: typeof PRIVACY_POLICY_PATH | typeof TERMS_OF_SERVICE_PATH,
  origin = "https://shalean.co.za",
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${path}`;
}
