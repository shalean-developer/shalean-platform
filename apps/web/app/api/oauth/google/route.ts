import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SEC,
  buildGoogleBusinessAuthUrl,
  createOAuthState,
  getGoogleOAuthConfig,
  hashOAuthState,
  marketingConnectedAccountsUrl,
} from "@/lib/oauth/googleBusinessOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/google
 *
 * Starts Google Business Profile OAuth (offline access + consent).
 * - Browser navigation: uses cookie session (admin only) and redirects to Google.
 * - Bearer adminFetch: returns `{ url }` so the UI can open the connect flow.
 *
 * Some Office roles can reach Connected Accounts with a valid admin cookie while
 * granular bearer RBAC does not include this OAuth bootstrap route. In that case,
 * fall back to the authenticated admin cookie instead of returning a false 403.
 */
export async function GET(request: Request) {
  const cfg = getGoogleOAuthConfig();
  const origin = new URL(request.url).origin;

  if (!cfg) {
    const msg =
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.";
    const wantsJson = request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: false }, { status: 503 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const auth = await requireAdminApi(request);
    if (!auth.ok) {
      const user = await getCookieUser();
      const cookieAdmin = await requireAdminUser(user);
      if (!cookieAdmin.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      console.info("[gbp] oauth_admin_cookie_fallback", {
        actor: cookieAdmin.email,
        bearerStatus: auth.status,
      });
    }
  } else {
    const user = await getCookieUser();
    const adminAuth = await requireAdminUser(user);
    if (!adminAuth.ok) {
      return NextResponse.redirect(marketingConnectedAccountsUrl({ error: "forbidden" }, origin));
    }
  }

  const state = createOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, hashOAuthState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SEC,
  });

  const url = buildGoogleBusinessAuthUrl(cfg, state);
  console.info("[gbp] oauth_start", { redirectUri: cfg.redirectUri });

  if (authHeader) {
    return NextResponse.json({ url, configured: true });
  }
  return NextResponse.redirect(url);
}
