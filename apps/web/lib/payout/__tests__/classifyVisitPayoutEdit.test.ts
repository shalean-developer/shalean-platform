import { describe, expect, it } from "vitest";
import { classifyVisitPayoutEdit, isBookingHybridOwner } from "@/lib/payout/classifyVisitPayoutEdit";

const LEAD = "015e91e8-df25-4fde-8db1-a5901b005ae3";
const MEMBER = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";

describe("classifyVisitPayoutEdit", () => {
  it("classifies true solo as solo_owner", () => {
    expect(
      classifyVisitPayoutEdit({
        is_team_job: false,
        cleaner_id: LEAD,
        requestedCleanerId: LEAD,
        rosterCleanerIds: [LEAD],
        earnings_summary: {
          model_version: "v3",
          per_cleaner_earnings: [
            {
              cleaner_id: LEAD,
              role: "lead",
              base_earning_cents: 25000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 25000,
            },
          ],
        },
      }),
    ).toBe("solo_owner");
  });

  it("classifies formal team jobs as per_cleaner", () => {
    expect(
      classifyVisitPayoutEdit({
        is_team_job: true,
        cleaner_id: LEAD,
        payout_owner_cleaner_id: LEAD,
        requestedCleanerId: MEMBER,
        rosterCleanerIds: [LEAD, MEMBER],
      }),
    ).toBe("per_cleaner");
  });

  it("classifies TJ-only member on is_team_job=false as per_cleaner (F02)", () => {
    expect(
      classifyVisitPayoutEdit({
        is_team_job: false,
        cleaner_id: LEAD,
        requestedCleanerId: MEMBER,
        rosterCleanerIds: [LEAD],
        hasTeamMemberPayoutRow: true,
        earnings_summary: {
          model_version: "v3",
          per_cleaner_earnings: [
            {
              cleaner_id: LEAD,
              role: "lead",
              base_earning_cents: 27000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 27000,
            },
          ],
        },
      }),
    ).toBe("per_cleaner");
  });

  it("classifies paired roster as per_cleaner", () => {
    expect(
      classifyVisitPayoutEdit({
        is_team_job: false,
        cleaner_id: LEAD,
        requestedCleanerId: MEMBER,
        rosterCleanerIds: [LEAD, MEMBER],
        hasRosterMemberPayoutRow: true,
      }),
    ).toBe("per_cleaner");
  });

  it("classifies multi-cleaner summary as per_cleaner even without is_team_job", () => {
    expect(
      classifyVisitPayoutEdit({
        is_team_job: false,
        cleaner_id: LEAD,
        requestedCleanerId: MEMBER,
        earnings_summary: {
          model_version: "v3",
          per_cleaner_earnings: [
            {
              cleaner_id: LEAD,
              role: "lead",
              base_earning_cents: 25000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 25000,
            },
            {
              cleaner_id: MEMBER,
              role: "member",
              base_earning_cents: 25000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 25000,
            },
          ],
        },
      }),
    ).toBe("per_cleaner");
  });
});

describe("isBookingHybridOwner", () => {
  it("treats cleaner_id as hybrid owner", () => {
    expect(isBookingHybridOwner({ cleaner_id: LEAD, payout_owner_cleaner_id: null }, LEAD)).toBe(true);
    expect(isBookingHybridOwner({ cleaner_id: LEAD, payout_owner_cleaner_id: null }, MEMBER)).toBe(false);
  });

  it("prefers payout_owner_cleaner_id", () => {
    expect(isBookingHybridOwner({ cleaner_id: null, payout_owner_cleaner_id: LEAD }, LEAD)).toBe(true);
  });
});
