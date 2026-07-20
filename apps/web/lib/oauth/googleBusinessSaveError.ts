/**
 * MKT-001A-PROD-R2 — Classify a Google Business Profile connect/save failure into a
 * small, sanitized reason code + operator-actionable message.
 *
 * Purpose: the OAuth callback previously collapsed every post-token-exchange failure
 * (Business Profile API disabled, rate limit, missing permission, no Business Profile,
 * revoked token, transient provider outage, or an actual DB/encryption save error) into
 * a single opaque `save_failed` → "Connected to Google but saving the account failed."
 *
 * This module is a PURE function (no secrets, no I/O, no `server-only`) so it can be used
 * by the server callback to attach a short `reason` token to the redirect AND by the
 * client Connected Accounts panel to render the matching message. It never echoes the raw
 * provider text, IDs, URLs, tokens, or status details back to the browser — only a fixed,
 * pre-approved string per category.
 */

export type GoogleBusinessSaveErrorReason =
  | "api_disabled"
  | "permission_denied"
  | "rate_limited"
  | "no_business_profile"
  | "token_revoked"
  | "provider_unavailable"
  | "save_failed";

/** Fixed, sanitized, operator-actionable copy. Never interpolates provider text. */
export const GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES: Record<GoogleBusinessSaveErrorReason, string> = {
  api_disabled:
    "Connected to Google, but the Business Profile API is disabled for this Google Cloud project. An operator must enable the Business Profile APIs, then reconnect.",
  permission_denied:
    "Connected to Google, but this account lacks Business Profile permissions (business.manage). Use a Google account that manages the Business Profile, then reconnect.",
  rate_limited:
    "Connected to Google, but Google is rate-limiting Business Profile requests. Wait a minute, then reconnect.",
  no_business_profile:
    "Connected to Google, but no Business Profile account or location was found for this Google account. Confirm it manages a Business Profile, then reconnect.",
  token_revoked:
    "Google access was revoked or expired. Start the Google connection again.",
  provider_unavailable:
    "Connected to Google, but Google Business Profile is temporarily unavailable. Try again shortly.",
  save_failed: "Connected to Google but saving the account failed.",
};

// Order matters: check the most specific signatures first (a disabled-API 403 body also
// mentions "business.manage", so `api_disabled` must win over `permission_denied`).
const API_DISABLED =
  /(has not been used in project|is disabled|accessnotconfigured|service_disabled|enable it by visiting|api .*not enabled|api is not enabled)/i;
const RATE_LIMITED = /(rate limit|resource_exhausted|too many requests|quota exceeded|quota exhausted)/i;
const TOKEN_REVOKED = /(invalid_grant|revoked|unauthenticated|token has been expired|expired or revoked)/i;
const NO_BUSINESS_PROFILE =
  /(no google business locations were found|business location was not found|no business profile|does not manage|no accounts were found)/i;
const PERMISSION_DENIED = /(permission_denied|permission denied|insufficient|business\.manage|not authorized)/i;
const PROVIDER_UNAVAILABLE =
  /(temporarily unavailable|service unavailable|backend error|internal error|network error|timed out|timeout)/i;

/**
 * Map a raw error string (and optional HTTP status) to a sanitized reason + message.
 * Unknown/unexpected/malicious inputs fall back to the generic `save_failed` copy; the
 * raw input is NEVER returned to the caller as user-facing text.
 */
export function classifyGoogleBusinessSaveError(
  rawError: string | null | undefined,
  status?: number,
): { reason: GoogleBusinessSaveErrorReason; message: string } {
  const text = typeof rawError === "string" ? rawError : "";

  let reason: GoogleBusinessSaveErrorReason = "save_failed";
  if (API_DISABLED.test(text)) {
    reason = "api_disabled";
  } else if (status === 429 || RATE_LIMITED.test(text)) {
    reason = "rate_limited";
  } else if (status === 401 || TOKEN_REVOKED.test(text)) {
    reason = "token_revoked";
  } else if (NO_BUSINESS_PROFILE.test(text)) {
    reason = "no_business_profile";
  } else if (status === 403 || PERMISSION_DENIED.test(text)) {
    reason = "permission_denied";
  } else if ((typeof status === "number" && status >= 500) || PROVIDER_UNAVAILABLE.test(text)) {
    reason = "provider_unavailable";
  }

  return { reason, message: GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES[reason] };
}

/** True when `value` is a known reason token (safe to trust from a query string). */
export function isGoogleBusinessSaveErrorReason(
  value: string | null | undefined,
): value is GoogleBusinessSaveErrorReason {
  return value != null && Object.prototype.hasOwnProperty.call(GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES, value);
}
