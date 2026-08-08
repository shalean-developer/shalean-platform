import { describe, expect, it } from "vitest";
import { policyForOfficePath } from "@/lib/admin/officeExperience";

describe("Priority 4 UAT preview safety", () => {
  it("keeps unknown Office routes fail-closed in the dedicated UAT build", () => {
    expect(policyForOfficePath("/office/priority4-uat-unregistered-sensitive-route")).toBeNull();
  });
});
