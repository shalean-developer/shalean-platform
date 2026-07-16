import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/tokenEncryption";
import { formatGoogleBusinessError } from "@/lib/google-business";
import {
  buildGoogleBusinessAuthUrl,
  createOAuthState,
  hashOAuthState,
  GOOGLE_BUSINESS_OAUTH_SCOPE,
} from "@/lib/oauth/googleBusinessOAuth";

describe("tokenEncryption", () => {
  const prevKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;

  const prevMktKey = process.env.MARKETING_OAUTH_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = "a".repeat(64);
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prevKey;
    if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
    if (prevMktKey === undefined) delete process.env.MARKETING_OAUTH_ENCRYPTION_KEY;
    else process.env.MARKETING_OAUTH_ENCRYPTION_KEY = prevMktKey;
  });

  it("round-trips secrets with AES-256-GCM (v2 key-versioned envelope)", () => {
    const cipher = encryptSecret("refresh-token-value");
    expect(cipher.startsWith("v2:")).toBe(true);
    expect(decryptSecret(cipher)).toBe("refresh-token-value");
  });

  it("passes through legacy plaintext values", () => {
    expect(decryptSecret("plain-legacy-token")).toBe("plain-legacy-token");
  });
});

describe("formatGoogleBusinessError", () => {
  it("maps revoked tokens to reconnect guidance", () => {
    const msg = formatGoogleBusinessError(
      { message: "Token has been expired or revoked.", status: "UNAUTHENTICATED" },
      401,
    );
    expect(msg.toLowerCase()).toContain("reconnect");
  });

  it("maps permission errors", () => {
    const msg = formatGoogleBusinessError(
      { message: "Permission denied", status: "PERMISSION_DENIED" },
      403,
    );
    expect(msg.toLowerCase()).toContain("permission");
  });

  it("maps rate limits", () => {
    const msg = formatGoogleBusinessError({ message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" }, 429);
    expect(msg.toLowerCase()).toContain("rate");
  });
});

describe("googleBusinessOAuth helpers", () => {
  it("builds auth URL with offline access and consent", () => {
    const state = createOAuthState();
    const url = buildGoogleBusinessAuthUrl(
      {
        clientId: "client.apps.googleusercontent.com",
        clientSecret: "secret",
        redirectUri: "https://shalean.co.za/api/oauth/google/callback",
      },
      state,
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("scope")).toBe(GOOGLE_BUSINESS_OAUTH_SCOPE);
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(hashOAuthState(state)).toHaveLength(64);
  });
});
