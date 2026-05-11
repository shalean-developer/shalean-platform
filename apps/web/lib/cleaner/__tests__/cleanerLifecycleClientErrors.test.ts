import { describe, expect, it } from "vitest";
import { cleanerLifecycleFailureMessage } from "@/lib/cleaner/cleanerLifecycleClientErrors";

describe("cleanerLifecycleFailureMessage", () => {
  it("maps payout_verify_failed", () => {
    const m = cleanerLifecycleFailureMessage({
      action: "complete",
      code: "payout_verify_failed",
      baseMessage: "Could not record earnings for this job.",
      httpStatus: 500,
    });
    expect(m).toContain("verified");
  });

  it("maps payout_persist_failed", () => {
    const m = cleanerLifecycleFailureMessage({
      action: "complete",
      code: "payout_persist_failed",
      baseMessage: "x",
      httpStatus: 500,
    });
    expect(m).toContain("record earnings");
  });

  it("maps payout_exceeds_financial_cap", () => {
    const m = cleanerLifecycleFailureMessage({
      action: "complete",
      code: "payout_exceeds_financial_cap",
      baseMessage: "x",
      httpStatus: 500,
    });
    expect(m).toContain("billing type");
  });

  /**
   * `job_earning_unavailable` is the 422 the completion API returns when
   * `display_earnings_cents <= 0`. The cleaner-facing copy must explicitly
   * tell them to contact support — not a generic retry message — because
   * retrying with the same data will fail again.
   */
  it("maps job_earning_unavailable to a contact-support message (no retry hint)", () => {
    const m = cleanerLifecycleFailureMessage({
      action: "complete",
      code: "job_earning_unavailable",
      baseMessage: "Job earning is R0,00 — please contact support.",
      httpStatus: 422,
    });
    expect(m).toContain("Job earning");
    expect(m).toContain("contact support");
    expect(m.toLowerCase()).not.toContain("try again");
  });
});
