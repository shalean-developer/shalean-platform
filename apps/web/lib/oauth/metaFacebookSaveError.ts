/**
 * MKT-001H — Sanitize Facebook OAuth / connect failures for browser redirects.
 * Pure module (no secrets, no I/O, no server-only) so client UI can map reason → copy.
 */

export type FacebookSaveErrorReason =
  | "oauth_denied"
  | "oauth_not_configured"
  | "encryption_not_configured"
  | "credential_mismatch"
  | "redirect_mismatch"
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
  encryption_not_configured:
    "Connected to Facebook, but token encryption is not configured. Set MARKETING_OAUTH_ENCRYPTION_KEY on staging Preview and redeploy.",
  credential_mismatch:
    "Connected to Facebook, but App ID/App Secret do not match. Confirm both values are from the same Meta app (Shalean Marketing), then redeploy.",
  redirect_mismatch:
    "Connected to Facebook, but the redirect URI did not match. Confirm FACEBOOK_REDIRECT_URI equals the Valid OAuth Redirect URI in Meta, then reconnect once.",
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

/** Safe callback stage labels for redacted runtime logs (never includes secrets). */
export type FacebookCallbackFailureStage =
  | "code_exchange"
  | "long_lived_exchange"
  | "page_discovery"
  | "encrypt"
  | "upsert"
  | "unknown";

const RATE_LIMITED = /(rate limit|too many requests|application request limit|code.: ?4\b|#4\b)/i;
const TOKEN_REVOKED =
  /(invalid oauth|session has expired|error validating access token|token.*(expired|revoked)|code.: ?190\b)/i;
const PERMISSION_DENIED =
  /(permission|pages_manage_posts|pages_show_list|pages_read_engagement|#200|insufficient)/i;
const NO_PAGES = /(no pages were found|no facebook pages|me\/accounts returned empty)/i;
const NO_ELIGIBLE = /(no eligible pages|none of the discovered pages)/i;
const PROVIDER_UNAVAILABLE =
  /(temporarily unavailable|service unavailable|backend error|internal error|network error|timed out|timeout)/i;
const ENCRYPTION_MISSING =
  /(MARKETING_OAUTH_ENCRYPTION_KEY|SOCIAL_TOKEN_ENCRYPTION_KEY|encryption key|TokenEncryptionConfigError)/i;
const CREDENTIAL_MISMATCH =
  /(client secret|app secret|validating client|application secret|invalid client)/i;
const REDIRECT_MISMATCH = /(redirect_uri|redirect uri|redirect URL)/i;

/** Extract Meta Graph numeric code when present; never returns message text. */
export function extractFacebookGraphErrorCode(rawError: string | null | undefined): number | null {
  if (!rawError) return null;
  const hash = rawError.match(/#(\d{1,4})\b/);
  if (hash) return Number(hash[1]);
  const codeField = rawError.match(/code["']?\s*[:=]\s*(\d{1,4})\b/i);
  if (codeField) return Number(codeField[1]);
  return null;
}

export function classifyFacebookSaveError(
  rawError: string | null | undefined,
  status?: number,
): { reason: FacebookSaveErrorReason; message: string } {
  const text = typeof rawError === "string" ? rawError : "";

  let reason: FacebookSaveErrorReason = "save_failed";
  if (ENCRYPTION_MISSING.test(text)) {
    reason = "encryption_not_configured";
  } else if (CREDENTIAL_MISMATCH.test(text)) {
    reason = "credential_mismatch";
  } else if (REDIRECT_MISMATCH.test(text)) {
    reason = "redirect_mismatch";
  } else if (NO_ELIGIBLE.test(text)) {
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
