import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatXPublishError, X_TWEET_CHAR_LIMIT } from "@/lib/promotions/xPublish";
import { createXProvider } from "@/lib/promotions/providers/xProvider";
import { classifyPublishFailure } from "@/lib/promotions/publishProviderErrors";

describe("MKT-001I X publish helpers", () => {
  it("formats 401/403/429 and duplicate failures", () => {
    expect(formatXPublishError({ detail: "unauthorized" }, 401).retryable).toBe(false);
    expect(formatXPublishError({ detail: "unauthorized" }, 401).error).toMatch(/reconnect/i);
    expect(formatXPublishError({ detail: "access level" }, 403).retryable).toBe(false);
    expect(formatXPublishError({ detail: "rate limit" }, 429).retryable).toBe(true);
    expect(formatXPublishError({ detail: "duplicate" }, 409).retryable).toBe(false);
  });

  it("classifies X failures with provider-specific recovery", () => {
    const auth = classifyPublishFailure({
      provider: "x",
      httpStatus: 401,
      rawMessage: "token expired",
    });
    expect(auth.classification).toBe("auth");
    expect(auth.retryable).toBe(false);
    expect(auth.recoveryGuidance.toLowerCase()).toContain("reconnect x");

    const permission = classifyPublishFailure({
      provider: "x",
      httpStatus: 403,
      rawMessage: "forbidden",
    });
    expect(permission.classification).toBe("permission");
    expect(permission.recoveryGuidance.toLowerCase()).toMatch(/tweet\.write|api product/);

    const rate = classifyPublishFailure({
      provider: "x",
      httpStatus: 429,
      rawMessage: "rate limit",
    });
    expect(rate.retryable).toBe(true);
  });
});

describe("MKT-001I X provider adapter", () => {
  const prevFlag = process.env.MARKETING_PROVIDER_X;

  beforeEach(() => {
    process.env.MARKETING_PROVIDER_X = "1";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.MARKETING_PROVIDER_X;
    else process.env.MARKETING_PROVIDER_X = prevFlag;
    vi.restoreAllMocks();
  });

  it("requires tweet text within character limit", () => {
    const x = createXProvider();
    expect(x.validateContent({ message: "" }).ok).toBe(false);
    expect(x.validateContent({ message: "a".repeat(X_TWEET_CHAR_LIMIT + 1) }).ok).toBe(false);
    expect(x.validateContent({ message: "Hello staging" }).ok).toBe(true);
  });

  it("exposes OAuth2 PKCE connect URL when configured", async () => {
    process.env.X_CLIENT_ID = "cid";
    process.env.X_CLIENT_SECRET = "csec";
    process.env.X_REDIRECT_URI = "https://staging.example.com/api/oauth/x/callback";
    const x = createXProvider();
    const result = await x.connect();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authorizationUrl).toBe("/api/oauth/x");
    }
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;
  });

  it("does not treat a missing DB row as connected", async () => {
    const x = createXProvider();
    const status = await x.validateConnection();
    expect(status.connected).toBe(false);
    expect(status.statusLabel).not.toBe("connected");
  });
});
