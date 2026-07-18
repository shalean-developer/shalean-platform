/**
 * MKT-001I — X (Twitter) OAuth 2.0 Authorization Code with PKCE.
 *
 * User-context tokens only (not app-only bearer). Required for POST /2/tweets.
 */

import "server-only";

import { createHash, randomBytes } from "crypto";

export const X_OAUTH_STATE_COOKIE = "x_oauth_state";
export const X_OAUTH_VERIFIER_COOKIE = "x_oauth_verifier";
export const X_OAUTH_CID_COOKIE = "x_oauth_cid";
export const X_OAUTH_STATE_MAX_AGE_SEC = 600;

/** Minimum scopes for identity + offline refresh + text post creation. */
export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_USERS_ME_URL = "https://api.x.com/2/users/me";
export const X_TWEETS_URL = "https://api.x.com/2/tweets";

export type XOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getXOAuthConfig(): XOAuthConfig | null {
  const clientId =
    process.env.X_CLIENT_ID?.trim() ||
    process.env.TWITTER_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.X_CLIENT_SECRET?.trim() ||
    process.env.TWITTER_CLIENT_SECRET?.trim() ||
    "";
  const redirectUri =
    process.env.X_REDIRECT_URI?.trim() ||
    process.env.TWITTER_REDIRECT_URI?.trim() ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/api/oauth/x/callback`
      : "");
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isXOAuthConfigured(): boolean {
  return getXOAuthConfig() != null;
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function createXOAuthCorrelationId(): string {
  return `x-oauth-${randomBytes(8).toString("hex")}`;
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/** PKCE code_verifier: 43–128 chars from unreserved set. */
export function createPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** S256 code_challenge = BASE64URL(SHA256(verifier)). */
export function createPkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function buildXAuthUrl(
  cfg: XOAuthConfig,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", X_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type XTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

function basicAuthHeader(cfg: XOAuthConfig): string {
  const raw = `${cfg.clientId}:${cfg.clientSecret}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

export async function exchangeXAuthorizationCode(
  cfg: XOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg),
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as XTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `X token exchange failed (${res.status}).`,
    );
  }
  return json;
}

export async function refreshXAccessToken(
  cfg: XOAuthConfig,
  refreshToken: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: cfg.clientId,
  });

  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg),
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as XTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `X token refresh failed (${res.status}).`,
    );
  }
  return json;
}

export async function revokeXToken(
  cfg: XOAuthConfig,
  token: string,
): Promise<{ ok: boolean; status: number }> {
  const body = new URLSearchParams({
    token,
    token_type_hint: "access_token",
    client_id: cfg.clientId,
  });
  const res = await fetch(X_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg),
    },
    body,
  });
  return { ok: res.ok, status: res.status };
}

export type XUserIdentity = {
  id: string;
  username: string | null;
  name: string | null;
};

export async function fetchXAuthenticatedUser(
  accessToken: string,
): Promise<XUserIdentity> {
  const url = new URL(X_USERS_ME_URL);
  url.searchParams.set("user.fields", "id,name,username");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; username?: string; name?: string };
    errors?: Array<{ message?: string; title?: string }>;
    detail?: string;
  };
  if (!res.ok || !json.data?.id) {
    const msg =
      json.errors?.[0]?.message ||
      json.errors?.[0]?.title ||
      json.detail ||
      `X user identity fetch failed (${res.status}).`;
    throw new Error(msg);
  }
  return {
    id: String(json.data.id),
    username: json.data.username ?? null,
    name: json.data.name ?? null,
  };
}

export function maskXUserId(id: string | null | undefined): string | null {
  if (!id) return null;
  const s = String(id);
  if (s.length <= 4) return `${s.slice(0, 1)}…`;
  return `${s.slice(0, 4)}…`;
}

export function maskXClientId(clientId: string | null | undefined): string | null {
  if (!clientId) return null;
  const s = String(clientId);
  if (s.length <= 4) return `…${s}`;
  return `…${s.slice(-4)}`;
}

/** Structured redacted diagnostics — never log tokens, codes, or verifiers. */
export function logXOAuthEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = { event, provider: "x" };
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    if (
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("verifier") ||
      key.includes("challenge") ||
      key === "code" ||
      key.includes("authorization")
    ) {
      continue;
    }
    safe[k] = v;
  }
  console.info("[x-oauth]", safe);
}

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

export function getXOAuthIdentity(): {
  configured: boolean;
  clientIdMasked: string | null;
  redirectHost: string | null;
  redirectPath: string | null;
} {
  const cfg = getXOAuthConfig();
  if (!cfg) {
    return { configured: false, clientIdMasked: null, redirectHost: null, redirectPath: null };
  }
  try {
    const u = new URL(cfg.redirectUri);
    return {
      configured: true,
      clientIdMasked: maskXClientId(cfg.clientId),
      redirectHost: u.host,
      redirectPath: u.pathname,
    };
  } catch {
    return {
      configured: true,
      clientIdMasked: maskXClientId(cfg.clientId),
      redirectHost: null,
      redirectPath: null,
    };
  }
}
