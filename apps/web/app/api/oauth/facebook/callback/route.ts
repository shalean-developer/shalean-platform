import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { isProviderFeatureEnabled } from "@/lib/promotions/providers/registry";
import {
  classifyFacebookSaveError,
  extractFacebookGraphErrorCode,
  type FacebookCallbackFailureStage,
} from "@/lib/oauth/metaFacebookSaveError";
import {
  FACEBOOK_OAUTH_PURPOSE_COOKIE,
  FACEBOOK_OAUTH_STATE_COOKIE,
  discoverFacebookPages,
  exchangeFacebookAuthorizationCode,
  exchangeFacebookLongLivedUserToken,
  fetchFacebookAppScopedUserId,
  getFacebookOAuthConfig,
  hashOAuthState,
  classifyFacebookOAuthProviderError,
  logFacebookOAuthEvent,
  marketingConnectedAccountsUrl,
  parseFacebookLoginPurpose,
  redactFacebookCallbackQuery,
} from "@/lib/oauth/metaFacebookOAuth";
import {
  resolveFacebookPublishConfig,
  saveFacebookOAuthConnection,
} from "@/lib/promotions/facebookConnectedAccount";
import { saveInstagramConnection } from "@/lib/promotions/instagramPublish";
import { hashMetaUserIdForAudit } from "@/lib/meta/dataDeletion";
import { TokenEncryptionConfigError } from "@/lib/security/tokenEncryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/facebook/callback
 *
 * Validates CSRF state, exchanges the authorization code server-side,
 * discovers Pages, persists encrypted tokens, redirects to Connected Accounts.
 * When OAuth purpose was Instagram, also discovers/saves the Page-linked IG account.
 * Never returns raw Meta payloads or access tokens to the browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const callbackQuery = redactFacebookCallbackQuery(url.searchParams);

  const clearStateCookies = async () => {
    const cookieStore = await cookies();
    cookieStore.delete(FACEBOOK_OAUTH_STATE_COOKIE);
    cookieStore.delete("fb_oauth_cid");
    cookieStore.delete(FACEBOOK_OAUTH_PURPOSE_COOKIE);
  };

  const cookieStore = await cookies();
  const correlationId = cookieStore.get("fb_oauth_cid")?.value ?? "fb-oauth-unknown";
  const purpose = parseFacebookLoginPurpose(cookieStore.get(FACEBOOK_OAUTH_PURPOSE_COOKIE)?.value);
  const hasStateCookie = Boolean(cookieStore.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value);
  const cfg = getFacebookOAuthConfig(purpose);

  logFacebookOAuthEvent("callback_received", {
    correlationId,
    provider: purpose === "instagram" ? "instagram" : "facebook",
    loginPurpose: purpose,
    redirectHost: url.host,
    redirectPath: url.pathname,
    hasStateCookie,
    paramKeys: callbackQuery.paramKeys.join(",") || null,
    hasCode: callbackQuery.hasCode,
    codeLength: callbackQuery.codeLength,
    hasState: callbackQuery.hasState,
    stateLength: callbackQuery.stateLength,
    hasError: callbackQuery.hasError,
    error: callbackQuery.error,
    errorReason: callbackQuery.errorReason,
    errorDescriptionPresent: callbackQuery.errorDescriptionPresent,
    errorDescriptionLength: callbackQuery.errorDescriptionLength,
    hasErrorCode: callbackQuery.hasErrorCode,
    errorCode: callbackQuery.errorCode,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  });

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
    // Meta Login for Business often returns access_denied + error_code=200 +
    // error_description=Permissions error (len 17) when the app is not Live or
    // the Login config permissions/assets cannot be granted — not a true cancel.
    const errorCategory = classifyFacebookOAuthProviderError({
      oauthError,
      errorCode: callbackQuery.errorCode,
      errorDescriptionLength: callbackQuery.errorDescriptionLength,
    });
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      errorCategory,
      failureStage: "unknown",
      error: callbackQuery.error,
      errorReason: callbackQuery.errorReason,
      errorCode: callbackQuery.errorCode,
      errorDescriptionPresent: callbackQuery.errorDescriptionPresent,
      errorDescriptionLength: callbackQuery.errorDescriptionLength,
      hasCode: callbackQuery.hasCode,
      hasState: callbackQuery.hasState,
    });
    await clearStateCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: errorCategory }, origin),
    );
  }

  if (!code || !state) {
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      errorCategory: "missing_code",
      failureStage: "unknown",
      hasStateCookie,
      hasCode: callbackQuery.hasCode,
      hasState: callbackQuery.hasState,
      paramKeys: callbackQuery.paramKeys.join(",") || null,
      error: callbackQuery.error,
      errorReason: callbackQuery.errorReason,
    });
    await clearStateCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "missing_code" }, origin));
  }

  const expectedHash = cookieStore.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;
  if (!expectedHash || expectedHash !== hashOAuthState(state)) {
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      errorCategory: "invalid_state",
      failureStage: "unknown",
      hasStateCookie,
      hasCode: callbackQuery.hasCode,
      hasState: callbackQuery.hasState,
    });
    await clearStateCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "invalid_state" }, origin));
  }

  // Single-use: clear state before exchange so replay fails.
  await clearStateCookies();

  const user = await getCookieUser();
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
  }

  let failureStage: FacebookCallbackFailureStage = "unknown";

  try {
    failureStage = "code_exchange";
    const shortLived = await exchangeFacebookAuthorizationCode(cfg, code);

    failureStage = "long_lived_exchange";
    const longLived = await exchangeFacebookLongLivedUserToken(cfg, shortLived.access_token);

    failureStage = "page_discovery";
    const discovered = await discoverFacebookPages(cfg, longLived.access_token);
    if (!discovered.ok) {
      const { reason } = classifyFacebookSaveError(discovered.error, discovered.status);
      logFacebookOAuthEvent("page_discovery_failed", {
        correlationId,
        provider: "facebook",
        loginPurpose: purpose,
        errorCategory: reason,
        failureStage: "page_discovery",
        graphErrorCode: extractFacebookGraphErrorCode(discovered.error),
        httpStatus: discovered.status ?? null,
        actor: user.email,
      });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl({ error: "save_failed", reason }, origin),
      );
    }

    // Best-effort app-scoped user id for Meta data-deletion correlation (hash only).
    let metaUserIdHash: string | null = null;
    const me = await fetchFacebookAppScopedUserId(cfg, longLived.access_token);
    if (me.ok) {
      metaUserIdHash = hashMetaUserIdForAudit(me.userId);
    } else {
      logFacebookOAuthEvent("meta_user_id_lookup_failed", {
        correlationId,
        provider: "facebook",
        loginPurpose: purpose,
        httpStatus: me.status ?? null,
        actor: user.email,
      });
    }

    failureStage = "upsert";
    const saved = await saveFacebookOAuthConnection({
      userAccessToken: longLived.access_token,
      expiresIn: longLived.expires_in ?? null,
      connectedBy: user.email,
      correlationId,
      pages: discovered.pages,
      metaUserIdHash,
    });

    if (!saved.ok) {
      const { reason } = classifyFacebookSaveError(saved.error);
      const stage: FacebookCallbackFailureStage =
        saved.failureStage ??
        (reason === "encryption_not_configured"
          ? "encrypt"
          : reason === "no_pages" || reason === "no_eligible_pages"
            ? "page_discovery"
            : "upsert");
      logFacebookOAuthEvent("callback_failed", {
        correlationId,
        provider: "facebook",
        loginPurpose: purpose,
        errorCategory: reason,
        failureStage: stage,
        graphErrorCode: extractFacebookGraphErrorCode(saved.error),
        dbErrorCode: saved.dbErrorCode ?? null,
        actor: user.email,
      });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl({ error: "save_failed", reason }, origin),
      );
    }

    let instagramConnected = false;
    let instagramError: string | null = null;
    // After Facebook Page persist (any purpose), try Page-linked IG discovery when
    // Instagram is enabled and a single Page was selected — pass the Page token
    // explicitly so we do not depend on a second DB round-trip.
    if (isProviderFeatureEnabled("instagram") && !saved.needsPagePick) {
      const pageCfg = await resolveFacebookPublishConfig();
      const ig = await saveInstagramConnection({
        connectedBy: user.email,
        accessToken: pageCfg.ok ? pageCfg.config.accessToken : undefined,
        pageId: pageCfg.ok ? pageCfg.config.pageId : undefined,
      });
      if (ig.ok) {
        instagramConnected = true;
        logFacebookOAuthEvent("ig_discovery_after_oauth_ok", {
          correlationId,
          provider: "instagram",
          loginPurpose: purpose,
          pageIdMasked: pageCfg.ok
            ? `${pageCfg.config.pageId.slice(0, 4)}…`
            : null,
          igUserIdMasked: `${ig.igUserId.slice(0, 4)}…`,
          usernamePresent: Boolean(ig.username),
          actor: user.email,
        });
      } else if (purpose === "instagram") {
        instagramError = ig.code ?? "ig_unavailable";
        logFacebookOAuthEvent("ig_discovery_after_oauth_failed", {
          correlationId,
          provider: "instagram",
          loginPurpose: purpose,
          errorCategory: ig.code ?? "ig_unavailable",
          actor: user.email,
        });
      }
    }

    logFacebookOAuthEvent("callback_succeeded", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      actor: user.email,
      needsPagePick: saved.needsPagePick,
      eligibleCount: saved.eligibleCount,
      instagramConnected,
    });

    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        {
          connected: instagramConnected ? "instagram" : "facebook",
          pick: saved.needsPagePick ? "1" : "0",
          cid: correlationId,
          ...(instagramError ? { ig_error: instagramError } : {}),
        },
        origin,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth callback failed.";
    const errorName = e instanceof Error ? e.name : "Error";
    if (e instanceof TokenEncryptionConfigError) {
      failureStage = "encrypt";
    }
    const { reason } = classifyFacebookSaveError(message);
    logFacebookOAuthEvent("callback_failed", {
      correlationId,
      provider: purpose === "instagram" ? "instagram" : "facebook",
      loginPurpose: purpose,
      errorCategory: reason,
      failureStage,
      errorName,
      graphErrorCode: extractFacebookGraphErrorCode(message),
      actor: user.email,
    });
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_failed", reason }, origin),
    );
  }
}
