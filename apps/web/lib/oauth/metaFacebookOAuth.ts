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
    // Prefer dedicated Instagram Graph API Login for Business config.
    return instagramConfigId || facebookConfigId || null;
  }
  return facebookConfigId || null;
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
  // Re-prompt so reconnect can grant missing permissions.
  url.searchParams.set("auth_type", "rerequest");

  // Facebook Login for Business: permissions live on the dashboard configuration.
  // Do not also pass raw Instagram scopes here — that triggers "Invalid Scopes"
  // when those permissions are not enabled on the Meta app.
  if (cfg.loginConfigId) {
    url.searchParams.set("config_id", cfg.loginConfigId);
  } else {
    url.searchParams.set("scope", FACEBOOK_OAUTH_SCOPE);
  }
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

  const pages: FacebookDiscoveredPage[] = [];
  for (const row of json.data ?? []) {
    const pageId = row.id?.trim();
    const accessToken = row.access_token?.trim();
    if (!pageId || !accessToken) continue;
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

  return { ok: true, pages };
}

export function maskFacebookPageId(pageId: string | null | undefined): string | null {
  if (!pageId) return null;
  if (pageId.length <= 4) return `${pageId}…`;
  return `${pageId.slice(0, 4)}…`;
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
      key === "code"
    ) {
      continue;
    }
    safe[k] = v as string | number | boolean | null;
  }
  console.info(`[facebook] ${event}`, safe);
}
