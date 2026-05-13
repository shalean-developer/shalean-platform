import { describe, expect, it } from "vitest";

import {
  classifyResendSendError,
  isPermanentConfigFailure,
  type ResendLikeError,
} from "@/lib/email/classifyResendSendError";

/**
 * M-9 — Pure unit tests for the Resend send-error classifier.
 *
 * The classifier drives the per-cron-run breaker decision: a
 * `permanent_config` outcome trips the breaker and short-circuits
 * remaining sends; `transient` and `permanent_validation` outcomes do
 * NOT. Misclassifying a transient failure as permanent would cause us to
 * silently drop reminders for an entire day; misclassifying a permanent-
 * config failure as transient would re-introduce the very retry-churn
 * bug M-9 fixes. So this suite exhaustively covers every documented
 * Resend `RESEND_ERROR_CODE_KEY`, every well-known HTTP status fallback,
 * and the synthetic sentinels we emit before the SDK is ever called.
 */
describe("classifyResendSendError (M-9)", () => {
  describe("permanent_config — deployment misconfiguration", () => {
    const cases: ResendLikeError[] = [
      { name: "missing_api_key", statusCode: 401, message: "Missing API key." },
      { name: "invalid_api_key", statusCode: 401, message: "Invalid API key." },
      { name: "restricted_api_key", statusCode: 401, message: "Restricted API key." },
      { name: "invalid_from_address", statusCode: 403, message: "From not verified." },
      { name: "invalid_access", statusCode: 403, message: "Forbidden." },
      { name: "invalid_region", statusCode: 422, message: "Invalid region." },
      { name: "security_error", statusCode: 451, message: "Security violation." },
    ];
    for (const err of cases) {
      it(`name=${err.name} → permanent_config`, () => {
        expect(classifyResendSendError(err)).toBe("permanent_config");
        expect(isPermanentConfigFailure(classifyResendSendError(err))).toBe(true);
      });
    }

    it("HTTP 401 with unknown name → permanent_config", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 401, message: "x" })).toBe(
        "permanent_config",
      );
    });

    it("HTTP 403 with unknown name → permanent_config", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 403, message: "x" })).toBe(
        "permanent_config",
      );
    });

    it("synthetic 'RESEND_API_KEY not set' sentinel → permanent_config (no name/status)", () => {
      expect(classifyResendSendError({ message: "RESEND_API_KEY not set" })).toBe("permanent_config");
    });

    it("synthetic 'RESEND_FROM invalid' sentinel → permanent_config", () => {
      expect(classifyResendSendError({ message: "RESEND_FROM invalid" })).toBe("permanent_config");
    });
  });

  describe("permanent_validation — per-recipient bad input", () => {
    const cases: ResendLikeError[] = [
      { name: "validation_error", statusCode: 422, message: "to is invalid." },
      { name: "missing_required_field", statusCode: 422, message: "subject required." },
      { name: "invalid_attachment", statusCode: 400, message: "attachment too large." },
      { name: "invalid_parameter", statusCode: 400, message: "bad parameter." },
      { name: "invalid_idempotency_key", statusCode: 400, message: "bad idempotency key." },
      { name: "invalid_idempotent_request", statusCode: 409, message: "idempotent mismatch." },
      { name: "concurrent_idempotent_requests", statusCode: 409, message: "concurrent." },
      { name: "method_not_allowed", statusCode: 405, message: "method not allowed." },
      { name: "not_found", statusCode: 404, message: "not found." },
    ];
    for (const err of cases) {
      it(`name=${err.name} → permanent_validation`, () => {
        expect(classifyResendSendError(err)).toBe("permanent_validation");
        expect(isPermanentConfigFailure(classifyResendSendError(err))).toBe(false);
      });
    }

    it("HTTP 400 with unknown name → permanent_validation", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 400, message: "x" })).toBe(
        "permanent_validation",
      );
    });

    it("HTTP 422 with unknown name → permanent_validation", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 422, message: "x" })).toBe(
        "permanent_validation",
      );
    });
  });

  describe("transient — provider-side, safe to retry on next cron tick", () => {
    const cases: ResendLikeError[] = [
      { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests." },
      { name: "monthly_quota_exceeded", statusCode: 429, message: "Quota." },
      { name: "daily_quota_exceeded", statusCode: 429, message: "Quota." },
      { name: "internal_server_error", statusCode: 500, message: "Internal error." },
      { name: "application_error", statusCode: 500, message: "Application error." },
    ];
    for (const err of cases) {
      it(`name=${err.name} → transient`, () => {
        expect(classifyResendSendError(err)).toBe("transient");
      });
    }

    it("HTTP 502 → transient", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 502, message: "x" })).toBe("transient");
    });

    it("HTTP 503 → transient", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 503, message: "x" })).toBe("transient");
    });

    it("HTTP 504 → transient", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 504, message: "x" })).toBe("transient");
    });

    it("HTTP 429 with unknown name → transient", () => {
      expect(classifyResendSendError({ name: "future_unknown_code", statusCode: 429, message: "x" })).toBe("transient");
    });

    it("error with no name and no status → transient (fail open)", () => {
      expect(classifyResendSendError({ message: "fetch failed" })).toBe("transient");
    });

    it("null/undefined error object → transient (defensive)", () => {
      expect(classifyResendSendError(null)).toBe("transient");
      expect(classifyResendSendError(undefined)).toBe("transient");
    });
  });

  describe("contract: classifier never returns an unknown value", () => {
    const allKnown: ResendLikeError[] = [
      { name: "missing_api_key", statusCode: 401, message: "" },
      { name: "validation_error", statusCode: 422, message: "" },
      { name: "rate_limit_exceeded", statusCode: 429, message: "" },
      { name: "internal_server_error", statusCode: 500, message: "" },
      { message: "RESEND_API_KEY not set" },
      { name: "future_unknown_code", statusCode: 600, message: "" },
      {},
    ];

    for (const err of allKnown) {
      it(`returns one of the three documented values for ${JSON.stringify(err)}`, () => {
        const c = classifyResendSendError(err);
        expect(["transient", "permanent_config", "permanent_validation"]).toContain(c);
      });
    }
  });

  describe("case-insensitivity guard for `name`", () => {
    it("uppercase name still classifies correctly", () => {
      expect(classifyResendSendError({ name: "MISSING_API_KEY", statusCode: 401, message: "" })).toBe(
        "permanent_config",
      );
      expect(classifyResendSendError({ name: "Validation_Error", statusCode: 422, message: "" })).toBe(
        "permanent_validation",
      );
      expect(classifyResendSendError({ name: "Rate_Limit_Exceeded", statusCode: 429, message: "" })).toBe("transient");
    });
  });
});
