import { NextResponse } from "next/server";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { isProviderFeatureEnabled } from "@/lib/promotions/providers/registry";
import {
  FACEBOOK_OAUTH_PURPOSE_COOKIE,
  FACEBOOK_OAUTH_STATE_COOKIE,
  FACEBOOK_OAUTH_STATE_MAX_AGE_SEC,
  buildFacebookAuthUrl,
  createFacebookOAuthCorrelationId,
  createOAuthState,
  getFacebookOAuthConfig,
  getFacebookOAuthIdentity,
  hashOAuthState,
  isFacebookLoginConfigReady,
  logFacebookOAuthEvent,
  marketingConnectedAccountsUrl,
  parseFacebookLoginPurpose,
  redactFacebookAuthUrl,
} from "@/lib/oauth/metaFacebookOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/facebook
 *
 * Starts Meta Facebook Login OAuth for Connected Accounts (MKT-001H / MKT-001H.2).
 * Optional `?purpose=instagram` uses INSTAGRAM_LOGIN_CONFIG_ID (Instagram Graph API
 * Login for Business variation) when configured.
 * - Browser navigation: cookie session (admin only) → redirect to Meta.
 * - Bearer adminFetch: returns `{ url }` so the UI can navigate.
 *
 * Login for Business `config_id` is required — classic scope-only authorize URLs
 * are rejected before redirect (Meta returns "config_id is required" otherwise).
 */
export async function GET(request: Request) {
  const purpose = parseFacebookLoginPurpose(new URL(request.url).searchParams.get("purpose"));
  const cfg = getFacebookOAuthConfig(purpose);
  const origin = new URL(request.url).origin;
  const correlationId = createFacebookOAuthCorrelationId();
  const wantsJson = Boolean(
    request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json"),
  );

  if (!cfg) {
    const msg =
      "Facebook OAuth is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.";
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: false }, { status: 503 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  if (!isFacebookLoginConfigReady(purpose)) {
    const msg =
      purpose === "instagram"
        ? "Instagram Login for Business config is missing. Set INSTAGRAM_LOGIN_CONFIG_ID (do not use classic scope)."
        : "Facebook Login for Business config is missing. Set FACEBOOK_LOGIN_CONFIG_ID (do not use classic scope).";
    logFacebookOAuthEvent("oauth_blocked_missing_login_config", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      hasConfigId: false,
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    });
    if (wantsJson) {
      return NextResponse.json(
        { error: msg, configured: true, loginConfigReady: false, loginPurpose: purpose },
        { status: 503 },
      );
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "login_config_missing" }, origin),
    );
  }

  if (!isProviderFeatureEnabled("facebook")) {
    const msg =
      "Facebook is disabled by feature flag (MARKETING_PROVIDER_FACEBOOK). Enable it before connecting.";
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: true, providerEnabled: false }, { status: 403 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "provider_disabled" }, origin),
    );
  }

  if (purpose === "instagram" && !isProviderFeatureEnabled("instagram")) {
    const msg =
      "Instagram is disabled by feature flag (MARKETING_PROVIDER_INSTAGRAM). Enable it before connecting.";
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: true, providerEnabled: false }, { status: 403 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "provider_disabled" }, origin),
    );
  }

  const authHeader = request.headers.get("authorization");
  let actor = "unknown";
  if (authHeader) {
    const auth = await requireAdminApi(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    actor = auth.email ?? "admin";
  } else {
    const user = await getCookieUser();
    const adminAuth = await requireAdminUser(user);
    if (!adminAuth.ok) {
      return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
    }
    actor = adminAuth.email;
  }

  const state = createOAuthState();
  // Preview/production on Vercel always serve HTTPS — never leave Secure unset there.
  const secureCookie =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge: FACEBOOK_OAUTH_STATE_MAX_AGE_SEC,
  };

  const url = buildFacebookAuthUrl(cfg, state);
  const redacted = redactFacebookAuthUrl(url);
  const identity = getFacebookOAuthIdentity(purpose);

  // Guard: never redirect a classic-scope URL when Login for Business is required.
  if (!redacted.hasConfigId || redacted.hasScope || redacted.incompatibleLoginForBusinessCombo) {
    logFacebookOAuthEvent("oauth_blocked_invalid_authorize_shape", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      hasConfigId: redacted.hasConfigId,
      hasScope: redacted.hasScope,
      incompatibleLoginForBusinessCombo: redacted.incompatibleLoginForBusinessCombo,
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    });
    if (wantsJson) {
      return NextResponse.json(
        { error: "Refusing to start Meta OAuth without a valid Login for Business config_id.", loginPurpose: purpose },
        { status: 503 },
      );
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "login_config_missing" }, origin),
    );
  }

  logFacebookOAuthEvent("oauth_started", {
    correlationId,
    provider: purpose === "instagram" ? "instagram" : "facebook",
    actor,
    loginPurpose: purpose,
    usingLoginConfigId: identity.usingLoginConfigId,
    appIdMasked: identity.appIdMasked,
    loginConfigIdMasked: identity.loginConfigIdMasked,
    facebookLoginConfigIdMasked: identity.facebookLoginConfigIdMasked,
    instagramLoginConfigIdMasked: identity.instagramLoginConfigIdMasked,
    redirectHost: redacted.redirectHost,
    redirectPath: redacted.redirectPath,
    graphVersion: redacted.graphVersion,
    responseType: redacted.responseType,
    authType: redacted.authType,
    hasScope: redacted.hasScope,
    hasConfigId: redacted.hasConfigId,
    hasOverrideDefaultResponseType: redacted.hasOverrideDefaultResponseType,
    loginTokenType: identity.loginTokenType,
    scopeNames: redacted.scopeNames.join(",") || null,
    incompatibleLoginForBusinessCombo: redacted.incompatibleLoginForBusinessCombo,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  });

  if (authHeader) {
    // JSON path: set cookies on the JSON response so a subsequent full navigation
    // is not required for CSRF — callers should still prefer assign() to the start URL.
    const json = NextResponse.json({
      url,
      configured: true,
      correlationId,
      loginPurpose: purpose,
      usingLoginConfigId: Boolean(cfg.loginConfigId),
      appIdMasked: identity.appIdMasked,
      loginConfigIdMasked: identity.loginConfigIdMasked,
    });
    json.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, hashOAuthState(state), cookieOpts);
    json.cookies.set("fb_oauth_cid", correlationId, cookieOpts);
    json.cookies.set(FACEBOOK_OAUTH_PURPOSE_COOKIE, purpose, cookieOpts);
    return json;
  }

  // Attach OAuth cookies to the redirect response itself. Relying only on
  // cookies() from next/headers has dropped Set-Cookie on some Vercel redirects
  // (callback then reports hasStateCookie=false / correlationId=fb-oauth-unknown).
  const redirect = NextResponse.redirect(url);
  redirect.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, hashOAuthState(state), cookieOpts);
  redirect.cookies.set("fb_oauth_cid", correlationId, cookieOpts);
  redirect.cookies.set(FACEBOOK_OAUTH_PURPOSE_COOKIE, purpose, cookieOpts);
  return redirect;
}
