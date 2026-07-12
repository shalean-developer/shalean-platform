import { describe, expect, it } from "vitest";
import {
  cleanerAccountEligibleForCustomerBooking,
  cleanerAccountEligibleForOpsAssignment,
} from "@/lib/booking/cleanerSlotEligibility";

describe("cleanerAccountEligibleForOpsAssignment", () => {
  it("allows offline cleaners that customer booking rejects", () => {
    const row = { is_active: true, is_available: false, status: "offline" };
    expect(cleanerAccountEligibleForCustomerBooking(row)).toBe(false);
    expect(cleanerAccountEligibleForOpsAssignment(row)).toBe(true);
  });

  it("rejects suspended/banned accounts for ops", () => {
    expect(cleanerAccountEligibleForOpsAssignment({ is_active: true, status: "suspended" })).toBe(false);
    expect(cleanerAccountEligibleForOpsAssignment({ is_active: true, status: "banned" })).toBe(false);
  });

  it("rejects inactive cleaners", () => {
    expect(cleanerAccountEligibleForOpsAssignment({ is_active: false, status: "available" })).toBe(false);
  });
});
