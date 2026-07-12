import "server-only";

import { createHash, randomBytes } from "crypto";

export const GOOGLE_BUSINESS_OAUTH_SCOPE = "https://www.googleapis.com/auth/business.manage";

export const GOOGLE_OAUTH_STATE_COOKIE = "gbp_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE_SEC = 600;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/api/oauth/google/callback`
      : "");
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() != null;
}

/** CSRF state for the OAuth round-trip (stored in httpOnly cookie). */
export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/**
 * Build Google's authorization URL with offline access + consent prompt
 * so we receive a refresh token on first connect / reconnect.
 */
export function buildGoogleBusinessAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_BUSINESS_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeGoogleAuthorizationCode(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Google token exchange failed (${res.status}).`,
    );
  }
  return json;
}

export async function refreshGoogleAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Google token refresh failed (${res.status}).`,
    );
  }
  return json;
}

/** Absolute URL back to Marketing → Connected Accounts (OAuth redirects require absolute). */
export function marketingConnectedAccountsUrl(
  query?: Record<string, string>,
  requestOrigin?: string | null,
): string {
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}` : "");
  const base = (envBase.startsWith("http") ? envBase : null) || requestOrigin || "http://localhost:3000";
  const path = "/office/marketing/connected-accounts";
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `${base.replace(/\/+$/, "")}${path}${qs}`;
}
