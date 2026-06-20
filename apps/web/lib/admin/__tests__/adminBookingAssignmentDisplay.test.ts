import { describe, expect, it } from "vitest";
import {
  adminBookingAssignmentDisplay,
  effectiveBookingCleanersForList,
  teamBookingMissingFormalAssignment,
} from "@/lib/admin/adminBookingAssignmentDisplay";

describe("adminBookingAssignmentDisplay", () => {
  it("shows team name when team_id is set", () => {
    expect(
      adminBookingAssignmentDisplay({
        team_id: "t1",
        team: { id: "t1", name: "Deep Crew A" },
        service_slug: "deep",
        booking_cleaners: [{ full_name: "A", role: "lead" }],
      }),
    ).toEqual({ label: "Deep Crew A", needsTeam: false });
  });

  it("shows Needs team for deep jobs with orphan roster and no team_id", () => {
    const roster = [
      { full_name: "Shyleen Pfende", role: "lead" },
      { full_name: "Sinikiwe Murir", role: "member" },
    ];
    const out = adminBookingAssignmentDisplay({
      service_slug: "deep",
      booking_cleaners: roster,
    });
    expect(out.needsTeam).toBe(true);
    expect(out.label).toBe("Needs team");
    expect(out.title).toContain("Shyleen");
  });

  it("shows cleaner names for non-team jobs with roster", () => {
    expect(
      adminBookingAssignmentDisplay({
        service_slug: "standard",
        booking_cleaners: [{ full_name: "Sam", role: "lead" }],
      }),
    ).toEqual({
      label: "Sam",
      title: "Sam (lead)",
      needsTeam: false,
    });
  });

  it("strips orphan roster from list payloads for team jobs without team_id", () => {
    const roster = [{ full_name: "A", role: "lead", cleaner_id: "c1" }];
    expect(
      effectiveBookingCleanersForList({ service_slug: "deep" }, roster),
    ).toEqual([]);
    expect(teamBookingMissingFormalAssignment({ service_slug: "deep" })).toBe(true);
  });
});
