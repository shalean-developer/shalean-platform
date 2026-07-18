import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FACEBOOK_INSTAGRAM_OAUTH_SCOPES,
  FACEBOOK_OAUTH_SCOPES,
  buildFacebookAuthUrl,
  classifyFacebookPageEligibility,
  createOAuthState,
  getFacebookOAuthConfig,
  getFacebookOAuthIdentity,
  hashOAuthState,
  isFacebookEnvTokenFallbackAllowed,
  isFacebookPageEligibleForPublish,
  isInstagramLoginConfigConfigured,
  logFacebookOAuthEvent,
  maskFacebookPageId,
  maskMetaNumericId,
  redactFacebookAuthUrl,
} from "@/lib/oauth/metaFacebookOAuth";
import {
  classifyFacebookSaveError,
  extractFacebookGraphErrorCode,
  isFacebookSaveErrorReason,
} from "@/lib/oauth/metaFacebookSaveError";

const STAGING_REDIRECT =
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback";

describe("MKT-001H metaFacebookOAuth", () => {
  beforeEach(() => {
    delete process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.FACEBOOK_REDIRECT_URI;
    delete process.env.FACEBOOK_LOGIN_CONFIG_ID;
    delete process.env.INSTAGRAM_LOGIN_CONFIG_ID;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_FACEBOOK_REDIRECT_URI;
    delete process.env.META_FACEBOOK_LOGIN_CONFIG_ID;
    delete process.env.META_INSTAGRAM_LOGIN_CONFIG_ID;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("generates cryptographically strong unique OAuth states", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).toHaveLength(48);
    expect(b).toHaveLength(48);
    expect(a).not.toBe(b);
  });

  it("hashes state deterministically and detects mismatch", () => {
    const state = createOAuthState();
    const hash = hashOAuthState(state);
    expect(hash).toBe(hashOAuthState(state));
    expect(hash).not.toBe(hashOAuthState(state + "x"));
  });

  it("builds Meta auth URL with Page permissions and rerequest", () => {
    const url = buildFacebookAuthUrl(
      {
        appId: "app123",
        appSecret: "secret",
        redirectUri: "https://example.com/api/oauth/facebook/callback",
        graphVersion: "v22.0",
        loginConfigId: null,
        loginPurpose: "facebook",
      },
      "state-abc",
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.facebook.com");
    expect(parsed.searchParams.get("client_id")).toBe("app123");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("auth_type")).toBe("rerequest");
    expect(parsed.searchParams.get("config_id")).toBeNull();
    expect(parsed.searchParams.get("override_default_response_type")).toBeNull();
    expect(parsed.searchParams.get("scope")).toBe(FACEBOOK_OAUTH_SCOPES.join(","));
    expect(FACEBOOK_OAUTH_SCOPES).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
    ]);
    expect(parsed.searchParams.get("scope")).not.toContain("instagram_");
    expect(FACEBOOK_INSTAGRAM_OAUTH_SCOPES).toEqual([
      "pages_read_user_content",
      "instagram_basic",
      "instagram_content_publish",
    ]);
  });

  it("uses Facebook Login for Business config_id when configured", () => {
    const url = buildFacebookAuthUrl(
      {
        appId: "app123",
        appSecret: "secret",
        redirectUri: "https://example.com/api/oauth/facebook/callback",
        graphVersion: "v22.0",
        loginConfigId: "cfg-instagram-pages",
        loginPurpose: "instagram",
      },
      "state-abc",
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("config_id")).toBe("cfg-instagram-pages");
    expect(parsed.searchParams.get("scope")).toBeNull();
    expect(parsed.searchParams.get("auth_type")).toBe("rerequest");
    expect(parsed.searchParams.get("override_default_response_type")).toBe("true");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.has("business_id")).toBe(false);
    expect(parsed.searchParams.has("extras")).toBe(false);
  });

  it("never combines classic scope with Login for Business config_id", () => {
    const withConfig = buildFacebookAuthUrl(
      {
        appId: "1111222233334444",
        appSecret: "secret",
        redirectUri: STAGING_REDIRECT,
        graphVersion: "v22.0",
        loginConfigId: "1645123456789012",
        loginPurpose: "facebook",
      },
      "state-abc",
    );
    const redacted = redactFacebookAuthUrl(withConfig);
    expect(redacted.hasConfigId).toBe(true);
    expect(redacted.hasScope).toBe(false);
    expect(redacted.incompatibleLoginForBusinessCombo).toBe(false);
    expect(redacted.scopeNames).toEqual([]);
    expect(redacted.clientIdMasked).toBe("…4444");
    expect(redacted.configIdMasked).toBe("…9012");
    expect(redacted.redirectHost).toBe(
      "shalean-platform-git-staging-shalean-cleaning-services.vercel.app",
    );
    expect(redacted.redirectPath).toBe("/api/oauth/facebook/callback");
  });

  it("resolves separate Facebook vs Instagram Login for Business config ids", () => {
    process.env.FACEBOOK_APP_ID = "1111222233334444";
    process.env.FACEBOOK_APP_SECRET = "secret1";
    process.env.FACEBOOK_REDIRECT_URI = STAGING_REDIRECT;
    process.env.FACEBOOK_LOGIN_CONFIG_ID = "1000000000000001";
    process.env.INSTAGRAM_LOGIN_CONFIG_ID = "2000000000000002";

    const fb = getFacebookOAuthConfig("facebook");
    const ig = getFacebookOAuthConfig("instagram");
    expect(fb?.loginConfigId).toBe("1000000000000001");
    expect(fb?.loginPurpose).toBe("facebook");
    expect(fb?.redirectUri).toBe(STAGING_REDIRECT);
    expect(ig?.loginConfigId).toBe("2000000000000002");
    expect(ig?.loginPurpose).toBe("instagram");
    expect(isInstagramLoginConfigConfigured()).toBe(true);

    const fbIdentity = getFacebookOAuthIdentity("facebook");
    const igIdentity = getFacebookOAuthIdentity("instagram");
    expect(fbIdentity.appIdMasked).toBe("…4444");
    expect(fbIdentity.loginConfigIdMasked).toBe("…0001");
    expect(igIdentity.loginConfigIdMasked).toBe("…0002");
    expect(fbIdentity.facebookLoginConfigIdMasked).toBe("…0001");
    expect(fbIdentity.instagramLoginConfigIdMasked).toBe("…0002");
    expect(JSON.stringify(fbIdentity)).not.toContain("secret1");
    expect(JSON.stringify(fbIdentity)).not.toContain("1111222233334444");

    delete process.env.INSTAGRAM_LOGIN_CONFIG_ID;
    expect(getFacebookOAuthConfig("instagram")?.loginConfigId).toBe("1000000000000001");
    expect(isInstagramLoginConfigConfigured()).toBe(false);
  });

  it("does not fall back to stale META_* app id when FACEBOOK_APP_ID is set", () => {
    process.env.META_APP_ID = "9999888877776666";
    process.env.META_APP_SECRET = "stale-secret";
    process.env.META_FACEBOOK_LOGIN_CONFIG_ID = "stale-config";
    process.env.FACEBOOK_APP_ID = "1111222233334444";
    process.env.FACEBOOK_APP_SECRET = "current-secret";
    process.env.FACEBOOK_REDIRECT_URI = STAGING_REDIRECT;
    process.env.FACEBOOK_LOGIN_CONFIG_ID = "1000000000000001";

    const cfg = getFacebookOAuthConfig("facebook");
    expect(cfg?.appId).toBe("1111222233334444");
    expect(cfg?.appSecret).toBe("current-secret");
    expect(cfg?.loginConfigId).toBe("1000000000000001");
    expect(cfg?.redirectUri).toBe(STAGING_REDIRECT);

    const url = buildFacebookAuthUrl(cfg!, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("1111222233334444");
    expect(parsed.searchParams.get("config_id")).toBe("1000000000000001");
    expect(parsed.searchParams.get("client_id")).not.toBe("9999888877776666");
  });

  it("masks Meta ids and redacts secrets from OAuth URL summaries", () => {
    expect(maskMetaNumericId("1645123456789012")).toBe("…9012");
    const url = buildFacebookAuthUrl(
      {
        appId: "1111222233334444",
        appSecret: "super-secret-value",
        redirectUri: STAGING_REDIRECT,
        graphVersion: "v22.0",
        loginConfigId: "1645123456789012",
        loginPurpose: "facebook",
      },
      "state-with-secret-looking-value",
    );
    const redacted = redactFacebookAuthUrl(url);
    expect(JSON.stringify(redacted)).not.toContain("super-secret-value");
    expect(JSON.stringify(redacted)).not.toContain("1111222233334444");
    expect(JSON.stringify(redacted)).not.toContain("1645123456789012");
    expect(redacted.clientIdMasked).toBe("…4444");
    expect(redacted.configIdMasked).toBe("…9012");
  });

  it("redacts token-like fields from OAuth log payloads", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logFacebookOAuthEvent("token_resolved", {
      provider: "facebook",
      accessToken: "EAABsupersecret",
      pageAccessToken: "page-secret",
      pageIdMasked: "1234…",
    });
    expect(spy).toHaveBeenCalledWith(
      "[facebook] token_resolved",
      expect.objectContaining({
        provider: "facebook",
        pageIdMasked: "1234…",
      }),
    );
    const logged = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(logged).not.toHaveProperty("accessToken");
    expect(logged).not.toHaveProperty("pageAccessToken");
    expect(JSON.stringify(logged)).not.toContain("secret");
    spy.mockRestore();
  });

  it("classifies Page eligibility from tasks", () => {
    expect(isFacebookPageEligibleForPublish(["ANALYZE", "CREATE_CONTENT"])).toBe(true);
    expect(isFacebookPageEligibleForPublish(["MANAGE"])).toBe(true);
    expect(isFacebookPageEligibleForPublish(["ANALYZE"])).toBe(false);
    expect(classifyFacebookPageEligibility(["MESSAGING"]).eligible).toBe(false);
    expect(classifyFacebookPageEligibility([]).ineligibleReason).toMatch(/tasks/i);
  });

  it("masks Page IDs for UI and logs", () => {
    expect(maskFacebookPageId("1234567890")).toBe("1234…");
    expect(maskFacebookPageId(null)).toBeNull();
  });

  it("disables env token fallback by default", () => {
    expect(isFacebookEnvTokenFallbackAllowed()).toBe(false);
    process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK = "1";
    expect(isFacebookEnvTokenFallbackAllowed()).toBe(true);
  });
});

describe("MKT-001H facebook save error classification", () => {
  it("never echoes raw provider text", () => {
    const { reason, message } = classifyFacebookSaveError(
      "OAuthException: secret_token=abc (#190) Invalid OAuth access token.",
      401,
    );
    expect(reason).toBe("token_revoked");
    expect(message).not.toContain("secret_token");
    expect(message).not.toContain("abc");
  });

  it("maps zero / ineligible page discovery", () => {
    expect(classifyFacebookSaveError("No Facebook Pages were found for this account").reason).toBe(
      "no_pages",
    );
    expect(
      classifyFacebookSaveError("None of the discovered Pages grant publish permission").reason,
    ).toBe("no_eligible_pages");
  });

  it("maps encryption / credential / redirect persistence failures", () => {
    expect(
      classifyFacebookSaveError(
        "Missing MARKETING_OAUTH_ENCRYPTION_KEY. Configure a dedicated 64-char hex encryption key.",
      ).reason,
    ).toBe("encryption_not_configured");
    expect(classifyFacebookSaveError("Error validating client secret.").reason).toBe(
      "credential_mismatch",
    );
    expect(
      classifyFacebookSaveError("Error validating verification code. Redirect URI mismatch.").reason,
    ).toBe("redirect_mismatch");
  });

  it("extracts Graph error codes without returning message text", () => {
    expect(extractFacebookGraphErrorCode("OAuthException (#190) Invalid token")).toBe(190);
    expect(extractFacebookGraphErrorCode('{"code": 100, "message": "x"}')).toBe(100);
    expect(extractFacebookGraphErrorCode(null)).toBeNull();
  });

  it("validates reason tokens for redirect query safety", () => {
    expect(isFacebookSaveErrorReason("no_pages")).toBe(true);
    expect(isFacebookSaveErrorReason("credential_mismatch")).toBe(true);
    expect(isFacebookSaveErrorReason("encryption_not_configured")).toBe(true);
    expect(isFacebookSaveErrorReason("totally_fake")).toBe(false);
  });
});
