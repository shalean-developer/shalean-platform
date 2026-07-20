import { describe, expect, it } from "vitest";
import {
  classifyPublishFailure,
  publishFailureResponseBody,
} from "@/lib/promotions/publishProviderErrors";

describe("classifyPublishFailure", () => {
  it("maps 401 to non-retryable auth", () => {
    const f = classifyPublishFailure({
      provider: "facebook",
      httpStatus: 401,
      rawMessage: "Invalid token",
    });
    expect(f.classification).toBe("auth");
    expect(f.retryable).toBe(false);
    expect(f.recoveryGuidance.toLowerCase()).toContain("facebook");
  });

  it("maps 429 to retryable rate limit", () => {
    const f = classifyPublishFailure({
      provider: "google_business",
      httpStatus: 429,
      rawMessage: "Quota exceeded",
    });
    expect(f.classification).toBe("rate_limit");
    expect(f.retryable).toBe(true);
    expect(f.retryAfterMs).toBe(60_000);
  });

  it("maps 503 to retryable provider unavailable", () => {
    const f = classifyPublishFailure({
      provider: "facebook",
      httpStatus: 503,
      rawMessage: "Service Unavailable",
    });
    expect(f.classification).toBe("provider_unavailable");
    expect(f.retryable).toBe(true);
  });

  it("maps transport timeout hints", () => {
    const f = classifyPublishFailure({
      provider: "google_business",
      rawMessage: "fetch failed",
      transportHint: "timeout",
    });
    expect(f.classification).toBe("timeout");
    expect(f.retryable).toBe(true);
    expect(f.httpStatus).toBe(504);
  });

  it("maps connection reset to network", () => {
    const f = classifyPublishFailure({
      provider: "facebook",
      rawMessage: "ECONNRESET",
      transportHint: "connection_reset",
    });
    expect(f.classification).toBe("network");
    expect(f.retryable).toBe(true);
  });

  it("shapes API response bodies", () => {
    const f = classifyPublishFailure({
      provider: "facebook",
      httpStatus: 429,
      rawMessage: "slow down",
    });
    expect(publishFailureResponseBody(f)).toMatchObject({
      error: "slow down",
      classification: "rate_limit",
      retryable: true,
    });
  });
});
