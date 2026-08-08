import { describe, expect, it } from "vitest";
import { cleanerTeamMembershipMatchesBookingDate } from "@/lib/cleaner/cleanerBookingAccess";

describe("P2 date-aware team booking visibility", () => {
  const membership = {
    team_id: "team-1",
    cleaner_id: "cleaner-1",
    active_from: "2026-08-05T00:00:00.000Z",
    active_to: "2026-08-10T23:59:59.999Z",
  };

  it("shows a team booking while the cleaner membership is active", () => {
    expect(
      cleanerTeamMembershipMatchesBookingDate(
        { team_id: "team-1", date: "2026-08-08" },
        [membership],
      ),
    ).toBe(true);
  });

  it("hides team bookings before the cleaner joined the team", () => {
    expect(
      cleanerTeamMembershipMatchesBookingDate(
        { team_id: "team-1", date: "2026-08-04" },
        [membership],
      ),
    ).toBe(false);
  });

  it("hides team bookings after the cleaner left the team", () => {
    expect(
      cleanerTeamMembershipMatchesBookingDate(
        { team_id: "team-1", date: "2026-08-11" },
        [membership],
      ),
    ).toBe(false);
  });

  it("does not let membership on another team grant access", () => {
    expect(
      cleanerTeamMembershipMatchesBookingDate(
        { team_id: "team-2", date: "2026-08-08" },
        [membership],
      ),
    ).toBe(false);
  });

  it("fails closed when the booking date is missing", () => {
    expect(
      cleanerTeamMembershipMatchesBookingDate(
        { team_id: "team-1", date: null },
        [membership],
      ),
    ).toBe(false);
  });
});
