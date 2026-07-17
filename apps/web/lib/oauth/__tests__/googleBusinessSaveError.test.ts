import { describe, expect, it } from "vitest";
import {
  GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES,
  classifyGoogleBusinessSaveError,
  isGoogleBusinessSaveErrorReason,
} from "@/lib/oauth/googleBusinessSaveError";

describe("classifyGoogleBusinessSaveError", () => {
  it("classifies a disabled Business Profile API (real Google 403 body)", () => {
    const raw =
      "My Business Account Management API has not been used in project 525459256770 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/overview?project=525459256770 then retry. Ensure the Google account manages this location and that the Business Profile APIs are enabled with the business.manage scope.";
    const { reason, message } = classifyGoogleBusinessSaveError(raw, 403);
    expect(reason).toBe("api_disabled");
    // api_disabled must win over permission_denied even though the body mentions business.manage
    expect(message).toBe(GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES.api_disabled);
  });

  it("classifies a rate limit (429) by status and by text", () => {
    expect(classifyGoogleBusinessSaveError("Google rate limit reached. Wait a minute and try again.").reason).toBe(
      "rate_limited",
    );
    expect(classifyGoogleBusinessSaveError("anything", 429).reason).toBe("rate_limited");
  });

  it("classifies a revoked/expired token", () => {
    expect(classifyGoogleBusinessSaveError("invalid_grant").reason).toBe("token_revoked");
    expect(
      classifyGoogleBusinessSaveError("Google access was revoked or the refresh token expired.").reason,
    ).toBe("token_revoked");
    expect(classifyGoogleBusinessSaveError("anything", 401).reason).toBe("token_revoked");
  });

  it("classifies missing Business Profile account/location", () => {
    expect(
      classifyGoogleBusinessSaveError(
        "No Google Business locations were found. Confirm this Google account manages at least one Business Profile location.",
      ).reason,
    ).toBe("no_business_profile");
  });

  it("classifies a plain permission denial (403 without api-disabled text)", () => {
    expect(classifyGoogleBusinessSaveError("Missing Google Business Profile permissions.", 403).reason).toBe(
      "permission_denied",
    );
    expect(classifyGoogleBusinessSaveError("PERMISSION_DENIED: insufficient scope").reason).toBe(
      "permission_denied",
    );
  });

  it("classifies transient provider failures", () => {
    expect(classifyGoogleBusinessSaveError("Service unavailable").reason).toBe("provider_unavailable");
    expect(classifyGoogleBusinessSaveError("boom", 503).reason).toBe("provider_unavailable");
    expect(classifyGoogleBusinessSaveError("Network error reaching Google Business APIs.").reason).toBe(
      "provider_unavailable",
    );
  });

  it("falls back to save_failed for empty/unknown errors (DB/encryption path)", () => {
    expect(classifyGoogleBusinessSaveError(null).reason).toBe("save_failed");
    expect(classifyGoogleBusinessSaveError(undefined).reason).toBe("save_failed");
    expect(classifyGoogleBusinessSaveError("").reason).toBe("save_failed");
    // DB/encryption save failures have no provider signature -> generic fallback
    expect(
      classifyGoogleBusinessSaveError("upsert violated a unique constraint on social_accounts").reason,
    ).toBe("save_failed");
    expect(
      classifyGoogleBusinessSaveError("TokenEncryptionConfigError: encryption key not set").reason,
    ).toBe("save_failed");
  });

  it("never echoes raw/malicious provider text into the user-facing message", () => {
    const malicious = [
      "<script>alert(document.cookie)</script>",
      "access_token=ya29.SUPERSECRETVALUE refresh_token=1//zzz",
      "Authorization: Bearer sk_live_leaked_key project 525459256770",
      "<img src=x onerror=alert(1)>",
      "'; DROP TABLE social_accounts; --",
    ];
    for (const input of malicious) {
      const { reason, message } = classifyGoogleBusinessSaveError(input);
      // message is always one of the fixed, pre-approved strings
      expect(Object.values(GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES)).toContain(message);
      expect(message).toBe(GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES[reason]);
      // and never contains any fragment of the raw input
      expect(message).not.toContain("<script");
      expect(message).not.toContain("ya29.");
      expect(message).not.toContain("Bearer");
      expect(message).not.toContain("DROP TABLE");
      expect(message).not.toContain("525459256770");
    }
  });

  it("recognises only known reason tokens (safe query-string trust)", () => {
    expect(isGoogleBusinessSaveErrorReason("api_disabled")).toBe(true);
    expect(isGoogleBusinessSaveErrorReason("rate_limited")).toBe(true);
    expect(isGoogleBusinessSaveErrorReason("save_failed")).toBe(true);
    expect(isGoogleBusinessSaveErrorReason("__proto__")).toBe(false);
    expect(isGoogleBusinessSaveErrorReason("constructor")).toBe(false);
    expect(isGoogleBusinessSaveErrorReason("nope")).toBe(false);
    expect(isGoogleBusinessSaveErrorReason(null)).toBe(false);
    expect(isGoogleBusinessSaveErrorReason(undefined)).toBe(false);
  });
});
