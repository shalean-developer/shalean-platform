import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FACEBOOK_OAUTH_SCOPES,
  buildFacebookAuthUrl,
  classifyFacebookPageEligibility,
  createOAuthState,
  hashOAuthState,
  isFacebookEnvTokenFallbackAllowed,
  isFacebookPageEligibleForPublish,
  maskFacebookPageId,
} from "@/lib/oauth/metaFacebookOAuth";
import {
  classifyFacebookSaveError,
  isFacebookSaveErrorReason,
} from "@/lib/oauth/metaFacebookSaveError";

describe("MKT-001H metaFacebookOAuth", () => {
  beforeEach(() => {
    delete process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK;
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

  it("builds Meta auth URL with required Page permissions only", () => {
    const url = buildFacebookAuthUrl(
      {
        appId: "app123",
        appSecret: "secret",
        redirectUri: "https://example.com/api/oauth/facebook/callback",
        graphVersion: "v22.0",
      },
      "state-abc",
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.facebook.com");
    expect(parsed.searchParams.get("client_id")).toBe("app123");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("scope")).toBe(FACEBOOK_OAUTH_SCOPES.join(","));
    expect(parsed.searchParams.get("scope")).toContain("pages_show_list");
    expect(parsed.searchParams.get("scope")).toContain("pages_read_engagement");
    expect(parsed.searchParams.get("scope")).toContain("pages_manage_posts");
    expect(parsed.searchParams.get("scope")).not.toContain("instagram_");
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

  it("validates reason tokens for redirect query safety", () => {
    expect(isFacebookSaveErrorReason("no_pages")).toBe(true);
    expect(isFacebookSaveErrorReason("totally_fake")).toBe(false);
  });
});
