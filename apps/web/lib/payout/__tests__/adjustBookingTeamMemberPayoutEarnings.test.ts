import { describe, expect, it } from "vitest";
import { adjustBookingTeamMemberPayoutEarnings } from "@/lib/payout/adjustBookingTeamMemberPayoutEarnings";

describe("adjustBookingTeamMemberPayoutEarnings", () => {
  it("is exported for team visit payout edits", () => {
    expect(typeof adjustBookingTeamMemberPayoutEarnings).toBe("function");
  });
});
