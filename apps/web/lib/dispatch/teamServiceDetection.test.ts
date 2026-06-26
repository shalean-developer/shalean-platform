import { describe, expect, it } from "vitest";
import { isTeamService, teamServiceType } from "@/lib/dispatch/teamServiceDetection";

describe("teamServiceDetection", () => {
  it("recognizes booking-v2 moving-cleaning slug as a team service", () => {
    expect(
      isTeamService({
        service: "moving-cleaning",
        service_slug: "moving-cleaning",
      }),
    ).toBe(true);
    expect(
      teamServiceType({
        service: "moving-cleaning",
        service_slug: "moving-cleaning",
      }),
    ).toBe("move_cleaning");
  });

  it("recognizes booking-v2 deep-cleaning slug as a team service", () => {
    expect(
      isTeamService({
        service: "deep-cleaning",
        service_slug: "deep-cleaning",
      }),
    ).toBe(true);
    expect(
      teamServiceType({
        service: "deep-cleaning",
        service_slug: "deep-cleaning",
      }),
    ).toBe("deep_cleaning");
  });

  it("reads serviceSlug from booking-v2 snapshot when columns are blank", () => {
    expect(
      isTeamService({
        service: "Moving Cleaning",
        service_slug: null,
        booking_snapshot: { serviceSlug: "moving-cleaning" },
      }),
    ).toBe(true);
    expect(
      teamServiceType({
        service: "Moving Cleaning",
        service_slug: null,
        booking_snapshot: { serviceSlug: "moving-cleaning" },
      }),
    ).toBe("move_cleaning");
  });

  it("does not treat standard cleaning as a team service", () => {
    expect(
      isTeamService({
        service: "regular-cleaning",
        service_slug: "regular-cleaning",
      }),
    ).toBe(false);
  });
});
