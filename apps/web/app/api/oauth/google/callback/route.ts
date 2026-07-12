import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { isAdmin } from "@/lib/auth/admin";
import { decryptSecret } from "@/lib/security/tokenEncryption";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  exchangeGoogleAuthorizationCode,
  getGoogleOAuthConfig,
  hashOAuthState,
  marketingConnectedAccountsUrl,
} from "@/lib/oauth/googleBusinessOAuth";
import { saveGoogleBusinessConnection } from "@/lib/google-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/google/callback
 *
 * Validates CSRF state, exchanges the authorization code, stores encrypted tokens,
 * loads Business accounts/locations, and redirects back to Connected Accounts.
 */
export async function GET(request: Request) {
  const cfg = getGoogleOAuthConfig();
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDesc = url.searchParams.get("error_description");

  const clearStateCookie = async () => {
    const cookieStore = await cookies();
    cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);
  };

  if (!cfg) {
    await clearStateCookie();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  if (oauthError) {
    console.warn("[gbp] oauth_denied", { oauthError, oauthErrorDesc });
    await clearStateCookie();
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
    await clearStateCookie();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "missing_code" }, origin));
  }

  const cookieStore = await cookies();
  const expectedHash = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!expectedHash || expectedHash !== hashOAuthState(state)) {
    console.warn("[gbp] oauth_state_mismatch");
    await clearStateCookie();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "invalid_state" }, origin));
  }

  const user = await getCookieUser();
  if (!user?.email || !isAdmin(user.email)) {
    await clearStateCookie();
    return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
  }

  try {
    const tokens = await exchangeGoogleAuthorizationCode(cfg, code);
    console.info("[gbp] oauth_token_exchange_ok", {
      hasRefresh: Boolean(tokens.refresh_token),
      expiresIn: tokens.expires_in,
    });

    // Reconnect may omit refresh_token — reuse the encrypted one already stored.
    let existingRefresh: string | null = null;
    if (!tokens.refresh_token) {
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data } = await admin
          .from("social_accounts")
          .select("refresh_token")
          .eq("provider", "google_business")
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

    const saved = await saveGoogleBusinessConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in,
      connectedBy: user.email,
      existingRefreshToken: existingRefresh,
    });

    await clearStateCookie();

    if (!saved.ok) {
      console.error("[gbp] oauth_save_failed", { error: saved.error });
      return NextResponse.redirect(
        marketingConnectedAccountsUrl(
          { error: "save_failed", detail: saved.error.slice(0, 120) },
          origin,
        ),
      );
    }

    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        {
          connected: "google_business",
          pick: saved.needsLocationPick ? "1" : "0",
        },
        origin,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth callback failed.";
    console.error("[gbp] oauth_callback_failed", { error: message });
    await clearStateCookie();
    return NextResponse.redirect(
      marketingConnectedAccountsUrl(
        { error: "oauth_failed", detail: message.slice(0, 120) },
        origin,
      ),
    );
  }
}
