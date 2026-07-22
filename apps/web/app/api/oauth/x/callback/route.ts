import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { isProviderFeatureEnabled } from "@/lib/promotions/providers/registry";
import {
  X_OAUTH_CID_COOKIE,
  X_OAUTH_STATE_COOKIE,
  X_OAUTH_VERIFIER_COOKIE,
  exchangeXAuthorizationCode,
  getXOAuthConfig,
  hashOAuthState,
  logXOAuthEvent,
  marketingConnectedAccountsUrl,
} from "@/lib/oauth/xOAuth";
import { saveXOAuthConnection } from "@/lib/promotions/xPublish";
import { decryptSecret } from "@/lib/security/tokenEncryption";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TokenEncryptionConfigError } from "@/lib/security/tokenEncryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/x/callback
 *
 * Validates state + PKCE verifier, exchanges code, fetches identity, encrypts tokens.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const clearCookies = async () => {
    const cookieStore = await cookies();
    cookieStore.delete(X_OAUTH_STATE_COOKIE);
    cookieStore.delete(X_OAUTH_VERIFIER_COOKIE);
    cookieStore.delete(X_OAUTH_CID_COOKIE);
  };

  const cookieStore = await cookies();
  const correlationId = cookieStore.get(X_OAUTH_CID_COOKIE)?.value ?? "x-oauth-unknown";
  const cfg = getXOAuthConfig();

  logXOAuthEvent("callback_received", {
    correlationId,
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasError: Boolean(oauthError),
    hasStateCookie: Boolean(cookieStore.get(X_OAUTH_STATE_COOKIE)?.value),
    hasVerifierCookie: Boolean(cookieStore.get(X_OAUTH_VERIFIER_COOKIE)?.value),
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  });

  if (!cfg) {
    await clearCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  if (!isProviderFeatureEnabled("x")) {
    await clearCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "provider_disabled" }, origin),
    );
  }

  if (oauthError) {
    logXOAuthEvent("callback_failed", {
      correlationId,
      errorCategory: oauthError === "access_denied" ? "oauth_denied" : "oauth_failed",
    });
    await clearCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        { error: oauthError === "access_denied" ? "oauth_denied" : "oauth_failed" },
        origin,
      ),
    );
  }

  if (!code || !state) {
    logXOAuthEvent("callback_failed", {
      correlationId,
      errorCategory: "missing_code",
    });
    await clearCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "missing_code" }, origin));
  }

  const expectedHash = cookieStore.get(X_OAUTH_STATE_COOKIE)?.value;
  if (!expectedHash || expectedHash !== hashOAuthState(state)) {
    logXOAuthEvent("callback_failed", {
      correlationId,
      errorCategory: "invalid_state",
    });
    await clearCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "invalid_state" }, origin));
  }

  const verifier = cookieStore.get(X_OAUTH_VERIFIER_COOKIE)?.value;
  if (!verifier) {
    logXOAuthEvent("callback_failed", {
      correlationId,
      errorCategory: "missing_verifier",
    });
    await clearCookies();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "missing_verifier" }, origin),
    );
  }

  const user = await getCookieUser();
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    await clearCookies();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
  }

  try {
    const tokens = await exchangeXAuthorizationCode(cfg, code, verifier);
    logXOAuthEvent("token_exchange_ok", {
      correlationId,
      hasRefresh: Boolean(tokens.refresh_token),
      expiresIn: tokens.expires_in,
    });

    let existingRefresh: string | null = null;
    if (!tokens.refresh_token) {
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data } = await admin
          .from("social_accounts")
          .select("refresh_token")
          .eq("provider", "twitter")
          .maybeSingle();
        if (data?.refresh_token) {
          try {
            existingRefresh = decryptSecret(data.refresh_token as string);
          } catch {
            existingRefresh = null;
          }
        }
      }
    }

    const saved = await saveXOAuthConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in,
      connectedBy: adminAuth.email,
      existingRefreshToken: existingRefresh,
      correlationId,
    });

    await clearCookies();

    if (!saved.ok) {
      logXOAuthEvent("save_failed", {
        correlationId,
        code: saved.code ?? null,
      });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl({ error: "save_failed" }, origin),
      );
    }

    logXOAuthEvent("oauth_complete", {
      correlationId,
      usernamePresent: Boolean(saved.username),
    });
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ connected: "x" }, origin),
    );
  } catch (e) {
    await clearCookies();
    const isEncrypt = e instanceof TokenEncryptionConfigError;
    logXOAuthEvent("callback_failed", {
      correlationId,
      errorCategory: isEncrypt ? "encryption_config" : "oauth_failed",
      error: e instanceof Error ? e.message.slice(0, 120) : "unknown",
    });
    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        { error: isEncrypt ? "encryption_config" : "oauth_failed" },
        origin,
      ),
    );
  }
}
