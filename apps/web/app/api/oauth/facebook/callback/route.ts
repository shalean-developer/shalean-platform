import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { isAdmin } from "@/lib/auth/admin";
import { isProviderFeatureEnabled } from "@/lib/promotions/providers/registry";
import { classifyFacebookSaveError } from "@/lib/oauth/metaFacebookSaveError";
import {
  FACEBOOK_OAUTH_STATE_COOKIE,
  discoverFacebookPages,
  exchangeFacebookAuthorizationCode,
  exchangeFacebookLongLivedUserToken,
  getFacebookOAuthConfig,
  hashOAuthState,
  logFacebookOAuthEvent,
  marketingConnectedAccountsUrl,
} from "@/lib/oauth/metaFacebookOAuth";
import { saveFacebookOAuthConnection } from "@/lib/promotions/facebookConnectedAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/facebook/callback
 *
 * Validates CSRF state, exchanges the authorization code server-side,
 * discovers Pages, persists encrypted tokens, redirects to Connected Accounts.
 * Never returns raw Meta payloads or access tokens to the browser.
 */
export async function GET(request: Request) {
  const cfg = getFacebookOAuthConfig();
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const clearStateCookies = async () => {
    const cookieStore = await cookies();
    cookieStore.delete(FACEBOOK_OAUTH_STATE_COOKIE);
    cookieStore.delete("fb_oauth_cid");
  };

  const cookieStore = await cookies();
  const correlationId = cookieStore.get("fb_oauth_cid")?.value ?? "fb-oauth-unknown";

  if (!cfg) {
    await clearStateCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  if (!isProviderFeatureEnabled("facebook")) {
    await clearStateCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "provider_disabled" }, origin),
    );
  }

  if (oauthError) {
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: "facebook",
      errorCategory: oauthError === "access_denied" ? "oauth_denied" : "oauth_failed",
    });
    await clearStateCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        {
          error: oauthError === "access_denied" ? "oauth_denied" : "oauth_failed",
        },
        origin,
      ),
    );
  }

  if (!code || !state) {
    await clearStateCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "missing_code" }, origin));
  }

  const expectedHash = cookieStore.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;
  if (!expectedHash || expectedHash !== hashOAuthState(state)) {
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: "facebook",
      errorCategory: "invalid_state",
    });
    await clearStateCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "invalid_state" }, origin));
  }

  // Single-use: clear state before exchange so replay fails.
  await clearStateCookies();

  const user = await getCookieUser();
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
  }

  try {
    const shortLived = await exchangeFacebookAuthorizationCode(cfg, code);
    const longLived = await exchangeFacebookLongLivedUserToken(cfg, shortLived.access_token);

    const discovered = await discoverFacebookPages(cfg, longLived.access_token);
    if (!discovered.ok) {
      const { reason } = classifyFacebookSaveError(discovered.error, discovered.status);
      logFacebookOAuthEvent("page_discovery_failed", {
        correlationId,
        provider: "facebook",
        errorCategory: reason,
        actor: user.email,
      });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl({ error: "save_failed", reason }, origin),
      );
    }

    const saved = await saveFacebookOAuthConnection({
      userAccessToken: longLived.access_token,
      expiresIn: longLived.expires_in ?? null,
      connectedBy: user.email,
      correlationId,
      pages: discovered.pages,
    });

    if (!saved.ok) {
      const { reason } = classifyFacebookSaveError(saved.error);
      logFacebookOAuthEvent("callback_failed", {
        correlationId,
        provider: "facebook",
        errorCategory: reason,
        actor: user.email,
      });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl({ error: "save_failed", reason }, origin),
      );
    }

    logFacebookOAuthEvent("callback_succeeded", {
      correlationId,
      provider: "facebook",
      actor: user.email,
      needsPagePick: saved.needsPagePick,
      eligibleCount: saved.eligibleCount,
    });

    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        {
          connected: "facebook",
          pick: saved.needsPagePick ? "1" : "0",
          cid: correlationId,
        },
        origin,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth callback failed.";
    const { reason } = classifyFacebookSaveError(message);
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: "facebook",
      errorCategory: reason,
      actor: user.email,
    });
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_failed", reason }, origin),
    );
  }
}
