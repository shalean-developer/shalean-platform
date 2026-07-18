import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { marketingConnectedAccountsUrl } from "@/lib/oauth/googleBusinessOAuth";

export { marketingConnectedAccountsUrl };

/**
 * Page permissions for Connected Accounts Facebook OAuth (MKT-001H).
 *
 * Instagram Graph permissions (`instagram_basic`, `instagram_content_publish`)
 * must NOT be passed as raw `scope` values unless the Meta app has those
 * permissions enabled on its Facebook Login / Login for Business configuration.
 * Requesting them without App Dashboard enablement returns:
 *   "Invalid Scopes: instagram_basic, instagram_content_publish"
 * (developer-only dialog).
 *
 * Prefer Facebook Login for Business with `FACEBOOK_LOGIN_CONFIG_ID` once a
 * dashboard configuration includes Page + Instagram permissions. See
 * FACEBOOK_INSTAGRAM_OAUTH_SCOPES and MKT-001H.1 docs.
 */
export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export const FACEBOOK_OAUTH_SCOPE = FACEBOOK_OAUTH_SCOPES.join(",");

/**
 * Target Instagram permissions for Page-linked Professional account discovery
 * + Content Publishing (Facebook Login path). Enable these on the Meta app
 * (Instagram product + Login for Business config) before requesting them.
 * `instagram_basic` also depends on `pages_read_user_content`.
 */
export const FACEBOOK_INSTAGRAM_OAUTH_SCOPES = [
  "pages_read_user_content",
  "instagram_basic",
  "instagram_content_publish",
] as const;

export const FACEBOOK_OAUTH_STATE_COOKIE = "fb_oauth_state";
export const FACEBOOK_OAUTH_STATE_MAX_AGE_SEC = 600;

export type FacebookOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  /** Facebook Login for Business configuration id for this OAuth purpose. */
  loginConfigId: string | null;
  /** Which Login for Business config was selected. */
  loginPurpose: FacebookLoginPurpose;
};

/** Facebook Page connect vs Instagram Graph API Login for Business configs. */
export type FacebookLoginPurpose = "facebook" | "instagram";

export const FACEBOOK_OAUTH_PURPOSE_COOKIE = "fb_oauth_purpose";

export function getFacebookGraphApiVersion(): string {
  return (
    process.env.FACEBOOK_GRAPH_API_VERSION?.trim() ||
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ||
    "v22.0"
  );
}

function resolveLoginConfigId(purpose: FacebookLoginPurpose): string | null {
  const facebookConfigId =
    process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim() ||
    process.env.META_FACEBOOK_LOGIN_CONFIG_ID?.trim() ||
    "";
  const instagramConfigId =
    process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim() ||
    process.env.META_INSTAGRAM_LOGIN_CONFIG_ID?.trim() ||
    "";

  if (purpose === "instagram") {
    // Instagram Graph API Login for Business must use its own config_id.
    // Do not fall back to the Facebook General config — that mixes purposes and
    // can surface Meta "config_id is required" / wrong-asset dialogs.
    return instagramConfigId || null;
  }
  return facebookConfigId || null;
}

/**
 * Login for Business is mandatory for Connect flows. Missing config_id must fail
 * closed before redirect so Meta never receives a classic scope-only authorize URL.
 */
export function isFacebookLoginConfigReady(purpose: FacebookLoginPurpose): boolean {
  return Boolean(resolveLoginConfigId(purpose));
}

/** Redacted inventory of which Meta env aliases are present (values never returned). */
export function getFacebookEnvAliasPresence(): {
  FACEBOOK_APP_ID: boolean;
  META_APP_ID: boolean;
  FACEBOOK_APP_SECRET: boolean;
  META_APP_SECRET: boolean;
  FACEBOOK_REDIRECT_URI: boolean;
  META_FACEBOOK_REDIRECT_URI: boolean;
  FACEBOOK_LOGIN_CONFIG_ID: boolean;
  META_FACEBOOK_LOGIN_CONFIG_ID: boolean;
  INSTAGRAM_LOGIN_CONFIG_ID: boolean;
  META_INSTAGRAM_LOGIN_CONFIG_ID: boolean;
  duplicateAppIdAliasRisk: boolean;
  duplicateFacebookConfigAliasRisk: boolean;
  duplicateInstagramConfigAliasRisk: boolean;
} {
  const FACEBOOK_APP_ID = Boolean(process.env.FACEBOOK_APP_ID?.trim());
  const META_APP_ID = Boolean(process.env.META_APP_ID?.trim());
  const FACEBOOK_APP_SECRET = Boolean(process.env.FACEBOOK_APP_SECRET?.trim());
  const META_APP_SECRET = Boolean(process.env.META_APP_SECRET?.trim());
  const FACEBOOK_REDIRECT_URI = Boolean(process.env.FACEBOOK_REDIRECT_URI?.trim());
  const META_FACEBOOK_REDIRECT_URI = Boolean(process.env.META_FACEBOOK_REDIRECT_URI?.trim());
  const FACEBOOK_LOGIN_CONFIG_ID = Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim());
  const META_FACEBOOK_LOGIN_CONFIG_ID = Boolean(
    process.env.META_FACEBOOK_LOGIN_CONFIG_ID?.trim(),
  );
  const INSTAGRAM_LOGIN_CONFIG_ID = Boolean(process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim());
  const META_INSTAGRAM_LOGIN_CONFIG_ID = Boolean(
    process.env.META_INSTAGRAM_LOGIN_CONFIG_ID?.trim(),
  );
  return {
    FACEBOOK_APP_ID,
    META_APP_ID,
    FACEBOOK_APP_SECRET,
    META_APP_SECRET,
    FACEBOOK_REDIRECT_URI,
    META_FACEBOOK_REDIRECT_URI,
    FACEBOOK_LOGIN_CONFIG_ID,
    META_FACEBOOK_LOGIN_CONFIG_ID,
    INSTAGRAM_LOGIN_CONFIG_ID,
    META_INSTAGRAM_LOGIN_CONFIG_ID,
    // Both primary + legacy aliases present → Preview precedence risk (values may differ).
    duplicateAppIdAliasRisk: FACEBOOK_APP_ID && META_APP_ID,
    duplicateFacebookConfigAliasRisk: FACEBOOK_LOGIN_CONFIG_ID && META_FACEBOOK_LOGIN_CONFIG_ID,
    duplicateInstagramConfigAliasRisk:
      INSTAGRAM_LOGIN_CONFIG_ID && META_INSTAGRAM_LOGIN_CONFIG_ID,
  };
}

export function parseFacebookLoginPurpose(
  raw: string | null | undefined,
): FacebookLoginPurpose {
  return raw?.trim().toLowerCase() === "instagram" ? "instagram" : "facebook";
}

export function getFacebookOAuthConfig(
  purpose: FacebookLoginPurpose = "facebook",
): FacebookOAuthConfig | null {
  const appId =
    process.env.FACEBOOK_APP_ID?.trim() || process.env.META_APP_ID?.trim() || "";
  const appSecret =
    process.env.FACEBOOK_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || "";
  const redirectUri =
    process.env.FACEBOOK_REDIRECT_URI?.trim() ||
    process.env.META_FACEBOOK_REDIRECT_URI?.trim() ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/api/oauth/facebook/callback`
      : "");
  if (!appId || !appSecret || !redirectUri) return null;
  return {
    appId,
    appSecret,
    redirectUri,
    graphVersion: getFacebookGraphApiVersion(),
    loginConfigId: resolveLoginConfigId(purpose),
    loginPurpose: purpose,
  };
}

/** True when a dedicated Instagram Login for Business config id is configured. */
export function isInstagramLoginConfigConfigured(): boolean {
  return Boolean(
    process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim() ||
      process.env.META_INSTAGRAM_LOGIN_CONFIG_ID?.trim(),
  );
}

export function isFacebookOAuthConfigured(): boolean {
  return getFacebookOAuthConfig() != null;
}

/**
 * Emergency/local env Page-token fallback (MKT-001H).
 * Disabled by default — must be explicitly enabled.
 */
export function isFacebookEnvTokenFallbackAllowed(): boolean {
  const raw = process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "on" || raw === "enabled";
}

/** CSRF state for the OAuth round-trip (stored hashed in httpOnly cookie). */
export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createFacebookOAuthCorrelationId(): string {
  return `fb-oauth-${randomUUID()}`;
}

export function buildFacebookAuthUrl(cfg: FacebookOAuthConfig, state: string): string {
  const url = new URL(`https://www.facebook.com/${cfg.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", cfg.appId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  // Facebook Login for Business: permissions / token type live on the dashboard
  // configuration. config_id replaces scope. Do not also send classic scope or
  // auth_type — Meta's business-extension dialog fails with a generic
  // "Sorry, something went wrong" when those are combined with config_id.
  if (cfg.loginConfigId) {
    url.searchParams.set("config_id", cfg.loginConfigId);
    // Required when response_type=code for Login for Business code grant.
    url.searchParams.set("override_default_response_type", "true");
    return url.toString();
  }

  // Classic Facebook Login: Page scopes + rerequest so reconnect can grant missing perms.
  url.searchParams.set("scope", FACEBOOK_OAUTH_SCOPE);
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

export type FacebookTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type GraphErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

function graphErrorMessage(json: { error?: GraphErrorBody }, status: number): string {
  const err = json.error;
  if (err?.message) return err.message;
  return `Facebook OAuth failed (${status}).`;
}

export async function exchangeFacebookAuthorizationCode(
  cfg: FacebookOAuthConfig,
  code: string,
): Promise<FacebookTokenResponse> {
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", cfg.appId);
  url.searchParams.set("client_secret", cfg.appSecret);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as FacebookTokenResponse & {
    error?: GraphErrorBody;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(graphErrorMessage(json, res.status));
  }
  return json;
}

/** Exchange a short-lived user token for a long-lived user token (~60 days). */
export async function exchangeFacebookLongLivedUserToken(
  cfg: FacebookOAuthConfig,
  shortLivedUserToken: string,
): Promise<FacebookTokenResponse> {
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", cfg.appId);
  url.searchParams.set("client_secret", cfg.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedUserToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as FacebookTokenResponse & {
    error?: GraphErrorBody;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(graphErrorMessage(json, res.status));
  }
  return json;
}

export type FacebookDiscoveredPage = {
  pageId: string;
  pageName: string;
  accessToken: string;
  tasks: string[];
  eligible: boolean;
  ineligibleReason: string | null;
};

/** Tasks that indicate the admin can publish content as the Page. */
const PUBLISH_TASKS = new Set(["CREATE_CONTENT", "MANAGE"]);

export function isFacebookPageEligibleForPublish(tasks: string[]): boolean {
  return tasks.some((t) => PUBLISH_TASKS.has(String(t).toUpperCase()));
}

export function classifyFacebookPageEligibility(tasks: string[]): {
  eligible: boolean;
  ineligibleReason: string | null;
} {
  if (!tasks.length) {
    return {
      eligible: false,
      ineligibleReason: "Page tasks were not returned; cannot confirm publish permission.",
    };
  }
  if (isFacebookPageEligibleForPublish(tasks)) {
    return { eligible: true, ineligibleReason: null };
  }
  return {
    eligible: false,
    ineligibleReason:
      "This Page does not grant CREATE_CONTENT or MANAGE. Choose a Page you can publish to.",
  };
}

/**
 * Discover Pages the user manages via GET /me/accounts.
 * Returns Page access tokens server-side only — never send these to the browser.
 */
export async function discoverFacebookPages(
  cfg: FacebookOAuthConfig,
  userAccessToken: string,
): Promise<
  | { ok: true; pages: FacebookDiscoveredPage[] }
  | { ok: false; error: string; status?: number }
> {
  const url = new URL(`https://graph.facebook.com/${cfg.graphVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,tasks");
  url.searchParams.set("access_token", userAccessToken);
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      tasks?: string[];
    }>;
    error?: GraphErrorBody;
  };

  if (!res.ok || json.error) {
    return {
      ok: false,
      status: res.status,
      error: graphErrorMessage(json, res.status),
    };
  }

  const rows = json.data ?? [];
  const pages: FacebookDiscoveredPage[] = [];
  let skippedMissingToken = 0;
  for (const row of rows) {
    const pageId = row.id?.trim();
    const accessToken = row.access_token?.trim();
    if (!pageId || !accessToken) {
      if (pageId && !accessToken) skippedMissingToken += 1;
      continue;
    }
    const tasks = Array.isArray(row.tasks) ? row.tasks.map(String) : [];
    const eligibility = classifyFacebookPageEligibility(tasks);
    pages.push({
      pageId,
      pageName: row.name?.trim() || `Page ${pageId}`,
      accessToken,
      tasks,
      eligible: eligibility.eligible,
      ineligibleReason: eligibility.ineligibleReason,
    });
  }

  // Redacted discovery shape — never log Page names/tokens.
  logFacebookOAuthEvent("page_discovery_result", {
    provider: "facebook",
    loginPurpose: cfg.loginPurpose,
    usingLoginConfigId: Boolean(cfg.loginConfigId),
    rawAccountCount: rows.length,
    pagesWithTokenCount: pages.length,
    skippedMissingTokenCount: skippedMissingToken,
    eligibleCount: pages.filter((p) => p.eligible).length,
  });

  return { ok: true, pages };
}

export function maskFacebookPageId(pageId: string | null | undefined): string | null {
  if (!pageId) return null;
  if (pageId.length <= 4) return `${pageId}…`;
  return `${pageId.slice(0, 4)}…`;
}

/** Mask Meta numeric IDs for logs/health — keep suffix for operator cross-check. */
export function maskMetaNumericId(id: string | null | undefined): string | null {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 4) return `…${trimmed}`;
  return `…${trimmed.slice(-4)}`;
}

export function redactFacebookAuthUrl(url: string): {
  host: string;
  pathname: string;
  graphVersion: string | null;
  clientIdMasked: string | null;
  configIdMasked: string | null;
  redirectHost: string | null;
  redirectPath: string | null;
  responseType: string | null;
  authType: string | null;
  hasScope: boolean;
  hasConfigId: boolean;
  hasOverrideDefaultResponseType: boolean;
  scopeNames: string[];
  incompatibleLoginForBusinessCombo: boolean;
} {
  const parsed = new URL(url);
  const scopeRaw = parsed.searchParams.get("scope");
  const configId = parsed.searchParams.get("config_id");
  const clientId = parsed.searchParams.get("client_id");
  const redirectUri = parsed.searchParams.get("redirect_uri");
  let redirectHost: string | null = null;
  let redirectPath: string | null = null;
  if (redirectUri) {
    try {
      const redirect = new URL(redirectUri);
      redirectHost = redirect.host;
      redirectPath = redirect.pathname;
    } catch {
      redirectHost = null;
      redirectPath = null;
    }
  }
  const versionMatch = parsed.pathname.match(/^\/(v\d+\.\d+)\//);
  const hasScope = Boolean(scopeRaw);
  const hasConfigId = Boolean(configId);
  return {
    host: parsed.host,
    pathname: parsed.pathname,
    graphVersion: versionMatch?.[1] ?? null,
    clientIdMasked: maskMetaNumericId(clientId),
    configIdMasked: maskMetaNumericId(configId),
    redirectHost,
    redirectPath,
    responseType: parsed.searchParams.get("response_type"),
    authType: parsed.searchParams.get("auth_type"),
    hasScope,
    hasConfigId,
    hasOverrideDefaultResponseType: parsed.searchParams.get("override_default_response_type") === "true",
    scopeNames: scopeRaw
      ? scopeRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    // Meta Login for Business: permissions live on config_id; do not also send scope.
    incompatibleLoginForBusinessCombo: hasScope && hasConfigId,
  };
}

/**
 * Classify Meta authorize redirect errors (no secrets).
 * Login for Business often masquerades permission/app-mode failures as user_denied
 * with error_code=200 and description "Permissions error" (length 17).
 */
export function classifyFacebookOAuthProviderError(input: {
  oauthError: string;
  errorCode?: string | null;
  errorDescriptionLength?: number | null;
}): "oauth_denied" | "oauth_permissions_error" | "oauth_failed" {
  if (input.oauthError !== "access_denied") return "oauth_failed";
  const permissionsError =
    input.errorCode === "200" || input.errorDescriptionLength === 17;
  return permissionsError ? "oauth_permissions_error" : "oauth_denied";
}

/**
 * Redact Meta OAuth callback query keys for diagnostics.
 * Never logs code/state/token values — only presence, lengths, and safe error fields.
 */
export function redactFacebookCallbackQuery(searchParams: URLSearchParams): {
  paramKeys: string[];
  hasCode: boolean;
  codeLength: number | null;
  hasState: boolean;
  stateLength: number | null;
  hasError: boolean;
  error: string | null;
  errorReason: string | null;
  errorDescriptionPresent: boolean;
  errorDescriptionLength: number | null;
  hasErrorCode: boolean;
  errorCode: string | null;
} {
  const keys = [...new Set(searchParams.keys())].sort();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");
  const errorDescription = searchParams.get("error_description");
  const errorCode = searchParams.get("error_code");
  return {
    paramKeys: keys,
    hasCode: Boolean(code),
    codeLength: code != null ? code.length : null,
    hasState: Boolean(state),
    stateLength: state != null ? state.length : null,
    hasError: Boolean(error),
    error: error?.trim() || null,
    errorReason: errorReason?.trim() || null,
    errorDescriptionPresent: Boolean(errorDescription),
    errorDescriptionLength: errorDescription != null ? errorDescription.length : null,
    hasErrorCode: Boolean(errorCode),
    errorCode: errorCode?.trim() || null,
  };
}

/** Redacted identity of the Meta app/config pair resolved for a purpose. */
export function getFacebookOAuthIdentity(
  purpose: FacebookLoginPurpose = "facebook",
): {
  configured: boolean;
  loginPurpose: FacebookLoginPurpose;
  appIdMasked: string | null;
  loginConfigIdMasked: string | null;
  facebookLoginConfigIdMasked: string | null;
  instagramLoginConfigIdMasked: string | null;
  redirectHost: string | null;
  redirectPath: string | null;
  graphVersion: string;
  usingLoginConfigId: boolean;
  hasAppSecret: boolean;
} {
  const cfg = getFacebookOAuthConfig(purpose);
  const facebookConfigId =
    process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim() ||
    process.env.META_FACEBOOK_LOGIN_CONFIG_ID?.trim() ||
    "";
  const instagramConfigId =
    process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim() ||
    process.env.META_INSTAGRAM_LOGIN_CONFIG_ID?.trim() ||
    "";
  let redirectHost: string | null = null;
  let redirectPath: string | null = null;
  if (cfg?.redirectUri) {
    try {
      const redirect = new URL(cfg.redirectUri);
      redirectHost = redirect.host;
      redirectPath = redirect.pathname;
    } catch {
      redirectHost = null;
      redirectPath = null;
    }
  }
  return {
    configured: cfg != null,
    loginPurpose: purpose,
    appIdMasked: maskMetaNumericId(cfg?.appId),
    loginConfigIdMasked: maskMetaNumericId(cfg?.loginConfigId),
    facebookLoginConfigIdMasked: maskMetaNumericId(facebookConfigId || null),
    instagramLoginConfigIdMasked: maskMetaNumericId(instagramConfigId || null),
    redirectHost,
    redirectPath,
    graphVersion: cfg?.graphVersion ?? getFacebookGraphApiVersion(),
    usingLoginConfigId: Boolean(cfg?.loginConfigId),
    hasAppSecret: Boolean(cfg?.appSecret),
  };
}

export function logFacebookOAuthEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("authorization") ||
      key === "code" ||
      key.includes("client_secret") ||
      (key.endsWith("url") && key.includes("oauth"))
    ) {
      continue;
    }
    safe[k] = v as string | number | boolean | null;
  }
  console.info(`[facebook] ${event}`, safe);
}
