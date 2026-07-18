import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOAuthState,
  createPkceChallengeS256,
  createPkceVerifier,
  buildXAuthUrl,
  getXOAuthConfig,
  hashOAuthState,
  logXOAuthEvent,
  maskXClientId,
  maskXUserId,
  X_OAUTH_SCOPES,
} from "@/lib/oauth/xOAuth";

describe("MKT-001I X OAuth PKCE helpers", () => {
  const prev = {
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
    TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
    TWITTER_REDIRECT_URI: process.env.TWITTER_REDIRECT_URI,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("generates cryptographically random state and hashed CSRF cookie value", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(hashOAuthState(a)).toHaveLength(64);
    expect(hashOAuthState(a)).not.toEqual(a);
  });

  it("generates PKCE verifier and S256 challenge", () => {
    const verifier = createPkceVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const challenge = createPkceChallengeS256(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toEqual(verifier);
    expect(createPkceChallengeS256(verifier)).toEqual(challenge);
  });

  it("builds authorize URL with required PKCE params and scopes", () => {
    const url = buildXAuthUrl(
      {
        clientId: "client123",
        clientSecret: "secret",
        redirectUri: "https://staging.example.com/api/oauth/x/callback",
      },
      "state-abc",
      "challenge-xyz",
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("client123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://staging.example.com/api/oauth/x/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-xyz");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    const scopes = (parsed.searchParams.get("scope") ?? "").split(" ");
    for (const s of X_OAUTH_SCOPES) {
      expect(scopes).toContain(s);
    }
  });

  it("reads env config and aliases", () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;
    process.env.TWITTER_CLIENT_ID = "tw-id";
    process.env.TWITTER_CLIENT_SECRET = "tw-secret";
    process.env.TWITTER_REDIRECT_URI = "https://ex.com/api/oauth/x/callback";
    const cfg = getXOAuthConfig();
    expect(cfg).toEqual({
      clientId: "tw-id",
      clientSecret: "tw-secret",
      redirectUri: "https://ex.com/api/oauth/x/callback",
    });
  });

  it("masks identifiers and redacts secrets from logs", () => {
    expect(maskXUserId("1234567890")).toBe("1234…");
    expect(maskXClientId("abcdefghij")).toBe("…ghij");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logXOAuthEvent("test", {
      access_token: "SECRET",
      code: "AUTHCODE",
      code_verifier: "VERIFIER",
      userIdMasked: "1234…",
    });
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("AUTHCODE");
    expect(logged).not.toContain("VERIFIER");
    expect(logged).toContain("1234…");
    spy.mockRestore();
  });
});
