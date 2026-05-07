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
});
