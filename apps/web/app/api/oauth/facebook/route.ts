import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { isAdmin } from "@/lib/auth/admin";
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
  hashOAuthState,
  logFacebookOAuthEvent,
  marketingConnectedAccountsUrl,
  parseFacebookLoginPurpose,
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
 */
export async function GET(request: Request) {
  const purpose = parseFacebookLoginPurpose(new URL(request.url).searchParams.get("purpose"));
  const cfg = getFacebookOAuthConfig(purpose);
  const origin = new URL(request.url).origin;
  const correlationId = createFacebookOAuthCorrelationId();

  if (!cfg) {
    const msg =
      "Facebook OAuth is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.";
    const wantsJson =
      request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: false }, { status: 503 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  if (!isProviderFeatureEnabled("facebook")) {
    const msg =
      "Facebook is disabled by feature flag (MARKETING_PROVIDER_FACEBOOK). Enable it before connecting.";
    const wantsJson =
      request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json");
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
    const wantsJson =
      request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json");
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
    if (!user?.email || !isAdmin(user.email)) {
      return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
    }
    actor = user.email;
  }

  const state = createOAuthState();
  // Preview/production on Vercel always serve HTTPS — never leave Secure unset there.
  const secureCookie =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set(FACEBOOK_OAUTH_STATE_COOKIE, hashOAuthState(state), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: FACEBOOK_OAUTH_STATE_MAX_AGE_SEC,
  });
  cookieStore.set("fb_oauth_cid", correlationId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: FACEBOOK_OAUTH_STATE_MAX_AGE_SEC,
  });
  cookieStore.set(FACEBOOK_OAUTH_PURPOSE_COOKIE, purpose, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: FACEBOOK_OAUTH_STATE_MAX_AGE_SEC,
  });

  const url = buildFacebookAuthUrl(cfg, state);
  logFacebookOAuthEvent("oauth_started", {
    correlationId,
    provider: purpose === "instagram" ? "instagram" : "facebook",
    actor,
    redirectUri: cfg.redirectUri,
    loginPurpose: purpose,
    usingLoginConfigId: Boolean(cfg.loginConfigId),
    loginConfigIdMasked: cfg.loginConfigId
      ? `${cfg.loginConfigId.slice(0, 4)}…`
      : null,
  });

  if (authHeader) {
    return NextResponse.json({
      url,
      configured: true,
      correlationId,
      loginPurpose: purpose,
      usingLoginConfigId: Boolean(cfg.loginConfigId),
    });
  }
  return NextResponse.redirect(url);
}
