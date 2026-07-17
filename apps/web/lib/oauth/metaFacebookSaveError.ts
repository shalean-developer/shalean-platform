/**
 * MKT-001H — Sanitize Facebook OAuth / connect failures for browser redirects.
 * Pure module (no secrets, no I/O, no server-only) so client UI can map reason → copy.
 */

export type FacebookSaveErrorReason =
  | "oauth_denied"
  | "oauth_not_configured"
  | "invalid_state"
  | "provider_disabled"
  | "no_pages"
  | "no_eligible_pages"
  | "permission_denied"
  | "token_revoked"
  | "rate_limited"
  | "provider_unavailable"
  | "save_failed";

export const FACEBOOK_SAVE_ERROR_MESSAGES: Record<FacebookSaveErrorReason, string> = {
  oauth_denied: "Facebook connection was cancelled or denied.",
  oauth_not_configured:
    "Facebook OAuth is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.",
  invalid_state: "OAuth state validation failed. Please start Connect Facebook again.",
  provider_disabled:
    "Facebook is disabled by feature flag (MARKETING_PROVIDER_FACEBOOK). Enable it before connecting.",
  no_pages: "Connected to Facebook, but no Pages were found for this account. Confirm you manage a Page, then reconnect.",
  no_eligible_pages:
    "Connected to Facebook, but none of the discovered Pages grant publish permission (CREATE_CONTENT or MANAGE).",
  permission_denied:
    "Connected to Facebook, but required Page permissions were not granted. Reconnect and approve pages_show_list, pages_read_engagement, and pages_manage_posts.",
  token_revoked: "Facebook access was revoked or expired. Reconnect Facebook from Connected Accounts.",
  rate_limited: "Facebook is rate-limiting requests. Wait a minute, then reconnect.",
  provider_unavailable: "Facebook is temporarily unavailable. Try again shortly.",
  save_failed: "Connected to Facebook but saving the account failed.",
};

const RATE_LIMITED = /(rate limit|too many requests|application request limit|code.: ?4\b|#4\b)/i;
const TOKEN_REVOKED =
  /(invalid oauth|session has expired|error validating access token|token.*(expired|revoked)|code.: ?190\b)/i;
const PERMISSION_DENIED =
  /(permission|pages_manage_posts|pages_show_list|pages_read_engagement|#200|insufficient)/i;
const NO_PAGES = /(no pages were found|no facebook pages|me\/accounts returned empty)/i;
const NO_ELIGIBLE = /(no eligible pages|none of the discovered pages)/i;
const PROVIDER_UNAVAILABLE =
  /(temporarily unavailable|service unavailable|backend error|internal error|network error|timed out|timeout)/i;

export function classifyFacebookSaveError(
  rawError: string | null | undefined,
  status?: number,
): { reason: FacebookSaveErrorReason; message: string } {
  const text = typeof rawError === "string" ? rawError : "";

  let reason: FacebookSaveErrorReason = "save_failed";
  if (NO_ELIGIBLE.test(text)) {
    reason = "no_eligible_pages";
  } else if (NO_PAGES.test(text)) {
    reason = "no_pages";
  } else if (status === 429 || RATE_LIMITED.test(text)) {
    reason = "rate_limited";
  } else if (status === 401 || TOKEN_REVOKED.test(text)) {
    reason = "token_revoked";
  } else if (status === 403 || PERMISSION_DENIED.test(text)) {
    reason = "permission_denied";
  } else if ((typeof status === "number" && status >= 500) || PROVIDER_UNAVAILABLE.test(text)) {
    reason = "provider_unavailable";
  }

  return { reason, message: FACEBOOK_SAVE_ERROR_MESSAGES[reason] };
}

export function isFacebookSaveErrorReason(
  value: string | null | undefined,
): value is FacebookSaveErrorReason {
  return value != null && Object.prototype.hasOwnProperty.call(FACEBOOK_SAVE_ERROR_MESSAGES, value);
}
