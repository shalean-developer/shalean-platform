import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bookingDetailsQuestionVisibleAtStage,
  bookingDetailsStage,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const scheduleSource = source("src/features/booking-v2/steps/Step2Schedule.tsx");
const teamAvailabilitySource = source(
  "src/features/booking-v2/components/TeamAvailabilitySection.tsx",
);
const contextSource = source("src/features/booking-v2/BookingV2Context.tsx");

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27820000000",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("Regular and Deep production parity during six-service convergence", () => {
  it("keeps Property visible while Regular and Deep are on Rooms", () => {
    const propertyQuestion = { key: "propertyType", group: undefined };
    expect(bookingDetailsQuestionVisibleAtStage("regular-cleaning", propertyQuestion, "rooms")).toBe(true);
    expect(bookingDetailsQuestionVisibleAtStage("deep-cleaning", propertyQuestion, "rooms")).toBe(true);
    expect(bookingDetailsQuestionVisibleAtStage("moving-cleaning", propertyQuestion, "rooms")).toBe(false);
  });

  it("keeps the approved Regular stage sequence", () => {
    expect(bookingDetailsStage("regular-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("regular-cleaning", { propertyType: "house" }, address)).toBe("rooms");
    expect(bookingDetailsStage("regular-cleaning", {
      propertyType: "house", bedrooms: "2", bathrooms: "1", extraRooms: "0",
    }, address)).toBe("pets");
  });

  it("keeps the approved Deep stage sequence", () => {
    expect(bookingDetailsStage("deep-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("deep-cleaning", { propertyType: "house" }, address)).toBe("rooms");
    expect(bookingDetailsStage("deep-cleaning", {
      propertyType: "house", bedrooms: "2", bathrooms: "1", extraRooms: "0",
    }, address)).toBe("pets");
  });

  it("keeps Regular and Deep on their existing section-sync path", () => {
    expect(contextSource).toContain(
      'serviceSlug !== "regular-cleaning" && serviceSlug !== "deep-cleaning"',
    );
    expect(contextSource).toContain(
      'serviceSlug === "regular-cleaning" ||\n      serviceSlug === "deep-cleaning"',
    );
  });

  it("limits date-change team clearing to Moving Cleaning", () => {
    expect(scheduleSource).toContain('if (isMovingCleaning && nextDate !== field.value) {');
    expect(scheduleSource).not.toContain('if (isTeamMode && nextDate !== field.value) {');
  });

  it("preserves Deep team-selection auto-advance and Moving explicit continuation", () => {
    expect(scheduleSource).toMatch(
      /if \(isDeepCleaning\) \{\s*void goNext\(\);\s*\}/,
    );
    expect(scheduleSource).toContain("{isMovingCleaning && isTeamMode ? (");
    expect(scheduleSource).toContain("Continue to Review →");
  });

  it("keeps Deep team availability on the production request path", () => {
    expect(teamAvailabilitySource).toContain('if (serviceSlug !== "moving-cleaning") {');
    expect(teamAvailabilitySource).toContain("fetch(`/api/booking-v2/team-availability?date=${date}&service=${serviceSlug}`)");
    expect(teamAvailabilitySource).toContain('cache: "no-store"');
  });
});
