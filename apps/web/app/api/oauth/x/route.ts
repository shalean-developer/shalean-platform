import { NextResponse } from "next/server";
import { getCookieUser } from "@/lib/auth/getCookieUser";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  X_OAUTH_CID_COOKIE,
  X_OAUTH_STATE_COOKIE,
  X_OAUTH_STATE_MAX_AGE_SEC,
  X_OAUTH_VERIFIER_COOKIE,
  buildXAuthUrl,
  createOAuthState,
  createPkceChallengeS256,
  createPkceVerifier,
  createXOAuthCorrelationId,
  getXOAuthConfig,
  getXOAuthIdentity,
  hashOAuthState,
  logXOAuthEvent,
  marketingConnectedAccountsUrl,
} from "@/lib/oauth/xOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/x
 *
 * Starts X OAuth 2.0 Authorization Code + PKCE for Connected Accounts (MKT-001I).
 * Connection is independent from the publishing feature flag; actual posting
 * remains fail-closed in the provider registry.
 */
export async function GET(request: Request) {
  const cfg = getXOAuthConfig();
  const origin = new URL(request.url).origin;
  const correlationId = createXOAuthCorrelationId();
  const wantsJson = Boolean(
    request.headers.get("authorization") || request.headers.get("accept")?.includes("application/json"),
  );

  if (!cfg) {
    const msg =
      "X OAuth is not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI.";
    if (wantsJson) {
      return NextResponse.json({ error: msg, configured: false }, { status: 503 });
    }
    return NextResponse.redirect(
      marketingConnectedAccountsUrl({ error: "oauth_not_configured" }, origin),
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
  const verifier = createPkceVerifier();
  const challenge = createPkceChallengeS256(verifier);
  const secureCookie =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge: X_OAUTH_STATE_MAX_AGE_SEC,
  };

  const url = buildXAuthUrl(cfg, state, challenge);
  const identity = getXOAuthIdentity();

  logXOAuthEvent("oauth_started", {
    correlationId,
    actor,
    clientIdMasked: identity.clientIdMasked,
    redirectHost: identity.redirectHost,
    redirectPath: identity.redirectPath,
    hasPkce: true,
    codeChallengeMethod: "S256",
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  });

  if (authHeader) {
    const json = NextResponse.json({
      url,
      configured: true,
      correlationId,
      clientIdMasked: identity.clientIdMasked,
    });
    json.cookies.set(X_OAUTH_STATE_COOKIE, hashOAuthState(state), cookieOpts);
    json.cookies.set(X_OAUTH_VERIFIER_COOKIE, verifier, cookieOpts);
    json.cookies.set(X_OAUTH_CID_COOKIE, correlationId, cookieOpts);
    return json;
  }

  const redirect = NextResponse.redirect(url);
  redirect.cookies.set(X_OAUTH_STATE_COOKIE, hashOAuthState(state), cookieOpts);
  redirect.cookies.set(X_OAUTH_VERIFIER_COOKIE, verifier, cookieOpts);
  redirect.cookies.set(X_OAUTH_CID_COOKIE, correlationId, cookieOpts);
  return redirect;
}
